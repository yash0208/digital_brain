import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";
import { loadConfig } from "../config";
import { githubConnector } from "../connectors/github";
import { linkedinBrowserConnector } from "../connectors/linkedin-browser";
import { overleafBrowserConnector } from "../connectors/overleaf-browser";
import type { SourceConnector } from "../connectors/types";
import { buildModelFriendlyBrain } from "../core/model-friendly-brain";
import { syncDocsToGithubRepo } from "../persistence/github-docs-sync";
import { MarkdownWriter } from "../persistence/markdown-writer";
import type { BrainEntity } from "../types/schema";

type RunMode = "full" | "incremental";

interface CheckpointState {
  connectors: Record<string, { lastSyncedAt: string }>;
}

interface ConnectorFailure {
  connector: string;
  message: string;
}

const defaultCheckpointState = (): CheckpointState => ({ connectors: {} });

const safeReadJson = async <T>(path: string, fallback: T): Promise<T> => {
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
};

const saveJson = async (path: string, payload: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const appendAuditLog = async (path: string, line: unknown): Promise<void> => {
  const current = await safeReadJson<unknown[]>(path, []);
  current.push(line);
  await saveJson(path, current);
};

const getConnectors = (): SourceConnector[] => [
  githubConnector,
  linkedinBrowserConnector,
  overleafBrowserConnector,
];

const dedupeEntities = (entities: BrainEntity[]): BrainEntity[] => {
  const byId = new Map<string, BrainEntity>();
  for (const entity of entities) {
    byId.set(entity.externalId, entity);
  }
  return Array.from(byId.values());
};

export const rebuildBrain = async (mode: RunMode = "incremental"): Promise<void> => {
  const log = (message: string): void => {
    console.log(`[brain] ${new Date().toISOString()} ${message}`);
  };

  const config = loadConfig();
  log(`starting rebuild mode=${mode}`);
  const checkpointState = await safeReadJson<CheckpointState>(config.checkpointFilePath, defaultCheckpointState());

  const markdownWriter = new MarkdownWriter({
    baseDir: config.markdownStoreDir,
    privacyMode: config.privacyMode,
  });

  const connectors = getConnectors();
  log(`connectors=${connectors.map((connector) => connector.name).join(",")}`);
  const runStartedAt = new Date().toISOString();
  let upsertedCount = 0;
  let unchangedCount = 0;
  const connectorFailures: ConnectorFailure[] = [];
  const collectedEntities: BrainEntity[] = [];

  for (const connector of connectors) {
    const connectorStartedAt = Date.now();
    log(`connector:start name=${connector.name}`);
    const previousSync = checkpointState.connectors[connector.name]?.lastSyncedAt;
    const since =
      mode === "incremental"
        ? previousSync
        : connector.name === "github"
          ? previousSync
          : undefined;
    let entities: BrainEntity[] = [];

    try {
      entities = dedupeEntities(
        await connector.collect({
          since,
          sources: {
            openaiApiKey: config.openaiApiKey,
            openaiModel: config.openaiModel,
            githubToken: config.githubToken,
            githubUsername: config.githubUsername,
            githubLocalCloneRoots: config.githubLocalCloneRoots,
            githubUpdateReadme: config.githubUpdateReadme,
            linkedinProfileUrl: config.linkedinProfileUrl,
            linkedinIngestionMode: config.linkedinIngestionMode,
            linkedinBrowserUserDataDir: config.linkedinBrowserUserDataDir,
            linkedinBrowserHeadless: config.linkedinBrowserHeadless,
            linkedinMaxPosts: config.linkedinMaxPosts,
            linkedinDebugDir: config.linkedinDebugDir,
            linkedinProfileJsonPath: config.linkedinProfileJsonPath,
            linkedinPostsJsonPath: config.linkedinPostsJsonPath,
            overleafGitToken: config.overleafGitToken,
            overleafEmail: config.overleafEmail,
            overleafDiscoveryMode: config.overleafDiscoveryMode,
            overleafProjectUrls: config.overleafProjectUrls,
          },
        })
      );
      log(`connector:collected name=${connector.name} entities=${entities.length}`);
      collectedEntities.push(...entities);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown connector error";
      connectorFailures.push({ connector: connector.name, message });
      log(`connector:error name=${connector.name} message=${message}`);
      if (!config.continueOnConnectorError) {
        throw error;
      }
      log(`connector:skipped name=${connector.name} continueOnConnectorError=true`);
      continue;
    }

    checkpointState.connectors[connector.name] = {
      lastSyncedAt: new Date().toISOString(),
    };
    const connectorElapsedMs = Date.now() - connectorStartedAt;
    log(`connector:done name=${connector.name} elapsedMs=${connectorElapsedMs}`);
  }

  const modelFriendly = await buildModelFriendlyBrain(collectedEntities, {
    openaiApiKey: config.openaiApiKey,
    openaiModel: config.openaiModel,
    onLog: (message) => log(`model-friendly:${message}`),
  });
  const finalEntities = dedupeEntities(modelFriendly.entities);
  log(`model-friendly:entities total=${finalEntities.length}`);

  for (const entity of finalEntities) {
    const changed = await markdownWriter.upsert(entity);
    if (changed) upsertedCount += 1;
    else unchangedCount += 1;
  }

  const staleDeletedCount = await markdownWriter.cleanupStaleFiles(finalEntities);
  log(`cleanup:staleMarkdownDeleted=${staleDeletedCount}`);

  let githubDocsSync = {
    enabled: config.githubDocsSyncEnabled,
    committed: false,
    pushed: false,
    skippedReason: undefined as string | undefined,
    error: undefined as string | undefined,
  };
  try {
    githubDocsSync = {
      ...githubDocsSync,
      ...(await syncDocsToGithubRepo(
        {
          enabled: config.githubDocsSyncEnabled,
          githubToken: config.githubToken,
          repoUrl: config.githubDocsRepoUrl,
          branch: config.githubDocsBranch,
          targetDir: config.githubDocsTargetDir,
          sourceDir: config.githubDocsSourceDir,
        },
        log
      )),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown github docs sync error";
    githubDocsSync.error = message;
    log(`github-docs:error message=${message}`);
    if (!config.continueOnConnectorError) {
      throw error;
    }
  }
  if (githubDocsSync.skippedReason) {
    log(`github-docs:skipped reason=${githubDocsSync.skippedReason}`);
  }

  await saveJson(config.checkpointFilePath, checkpointState);
  await appendAuditLog(config.auditLogPath, {
    runStartedAt,
    runEndedAt: new Date().toISOString(),
    mode,
    upsertedCount,
    unchangedCount,
    staleDeletedCount,
    githubDocsSync,
    openaiGeneration: modelFriendly.stats,
    connectorCount: connectors.length,
    connectorFailures,
  });
  log(
    `rebuild:done upserted=${upsertedCount} unchanged=${unchangedCount} connectorFailures=${connectorFailures.length}`
  );
};
