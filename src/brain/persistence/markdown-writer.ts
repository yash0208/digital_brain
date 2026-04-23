import { mkdir, readFile, readdir, rmdir, unlink, writeFile } from "fs/promises";
import { dirname, join } from "path";
import type { BrainEntity, PrivacyMode } from "../types/schema";
import { withPrivacy } from "../core/normalize";

interface MarkdownWriterOptions {
  baseDir: string;
  privacyMode: PrivacyMode;
}

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const pickLabel = (entity: BrainEntity): string => {
  const data = entity.data as Record<string, unknown>;
  const candidate =
    (typeof data.title === "string" && data.title) ||
    (typeof data.name === "string" && data.name) ||
    (typeof data.profileName === "string" && data.profileName) ||
    (typeof data.displayName === "string" && data.displayName) ||
    entity.sourceRecordId;
  return candidate;
};

const idTail = (externalId: string): string => {
  const tail = externalId.split(":").pop() ?? externalId;
  return tail.slice(-8);
};

const stringifyValue = (value: unknown): string => {
  if (typeof value === "string") return value.replace(/\n/g, " ");
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

const toFrontmatter = (entity: BrainEntity, rawPayload: unknown): string => {
  const lines = [
    "---",
    `entityType: ${entity.entityType}`,
    `externalId: ${entity.externalId}`,
    `source: ${entity.source}`,
    `sourceRecordId: ${entity.sourceRecordId}`,
    `observedAt: ${entity.observedAt}`,
    `lastSyncedAt: ${entity.lastSyncedAt}`,
  ];

  if (entity.sourceUrl) {
    lines.push(`sourceUrl: ${entity.sourceUrl}`);
  }

  if (rawPayload !== undefined) {
    lines.push(`rawPayload: '${JSON.stringify(rawPayload).replace(/'/g, "''")}'`);
  }

  lines.push("---");
  return lines.join("\n");
};

const toBody = (entity: BrainEntity): string => {
  const records = Object.entries(entity.data as Record<string, unknown>).map(([key, value]) => `- ${key}: ${stringifyValue(value)}`);
  return ["# Entity", "", ...records, ""].join("\n");
};

const safeRead = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
};

const walkMarkdownFiles = async (dir: string): Promise<string[]> => {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) return walkMarkdownFiles(fullPath);
      if (entry.isFile() && entry.name.endsWith(".md")) return [fullPath];
      return [];
    })
  );

  return nested.flat();
};

const safeDelete = async (path: string): Promise<void> => {
  try {
    await unlink(path);
  } catch {
    return;
  }
};

const safeRemoveDir = async (path: string): Promise<void> => {
  try {
    await rmdir(path);
  } catch {
    return;
  }
};

export class MarkdownWriter {
  private readonly options: MarkdownWriterOptions;

  constructor(options: MarkdownWriterOptions) {
    this.options = options;
  }

  private entityPath(entity: BrainEntity): string {
    const label = toSlug(pickLabel(entity));
    const source = toSlug(entity.source);
    const suffix = idTail(entity.externalId);
    const fileName = `${entity.entityType}--${source}--${label}--${suffix}.md`;
    return join(this.options.baseDir, entity.entityType, fileName);
  }

  pathForEntity(entity: BrainEntity): string {
    return this.entityPath(entity);
  }

  async upsert(entity: BrainEntity): Promise<boolean> {
    const path = this.entityPath(entity);
    const rawPayload = withPrivacy(entity.rawPayload, this.options.privacyMode, "local");
    const content = `${toFrontmatter(entity, rawPayload)}\n\n${toBody(entity)}`;

    await mkdir(dirname(path), { recursive: true });
    const existing = await safeRead(path);

    if (existing === content) {
      return false;
    }

    await writeFile(path, content, "utf8");
    return true;
  }

  async cleanupStaleFiles(validEntities: BrainEntity[]): Promise<number> {
    const markdownFiles = await walkMarkdownFiles(this.options.baseDir);
    const validPaths = new Set(validEntities.map((entity) => this.entityPath(entity)));
    let deleted = 0;

    for (const path of markdownFiles) {
      if (validPaths.has(path)) continue;
      await safeDelete(path);
      deleted += 1;
    }

    // Legacy commit_activity files are deprecated and should never persist.
    await safeRemoveDir(join(this.options.baseDir, "commit_activity"));
    return deleted;
  }
}
