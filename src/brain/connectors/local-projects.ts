import { readdir } from "fs/promises";
import { join } from "path";
import { normalizeEntity } from "../core/normalize";
import { makeEntityId } from "../core/id";
import type { BrainEntity, Project } from "../types/schema";
import type { ConnectorContext, SourceConnector } from "./types";

const isLikelyProjectDir = (name: string): boolean => !name.startsWith(".");

const scanRoot = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && isLikelyProjectDir(entry.name)).map((entry) => join(root, entry.name));
};

const mapLocalProject = (path: string): BrainEntity => {
  const folderName = path.split("/").filter(Boolean).pop() ?? "project";
  const data: Project = {
    id: makeEntityId("project", "local", path),
    name: folderName,
    summary: `Discovered from local root: ${path}`,
    status: "active",
    organizations: [],
    repoIds: [],
    documentIds: [],
  };

  return normalizeEntity({
    entityType: "project",
    source: "local",
    sourceRecordId: path,
    sourceUrl: undefined,
    data,
    rawPayload: { path },
  });
};

export const localProjectsConnector: SourceConnector = {
  name: "local-projects",
  async collect(context: ConnectorContext): Promise<BrainEntity[]> {
    if (context.sources.localProjectRoots.length === 0) {
      return [];
    }

    const collected: BrainEntity[] = [];

    for (const root of context.sources.localProjectRoots) {
      const projectDirs = await scanRoot(root);
      for (const projectPath of projectDirs) {
        collected.push(mapLocalProject(projectPath));
      }
    }

    return collected;
  },
};
