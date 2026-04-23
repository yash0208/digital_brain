import { normalizeEntity } from "../core/normalize";
import { makeEntityId } from "../core/id";
import type { BrainEntity, Document, Project } from "../types/schema";
import type { ConnectorContext, SourceConnector } from "./types";

interface OverleafProjectInput {
  projectId: string;
  name: string;
  url?: string;
  updatedAt?: string;
  authMode?: "git-token" | "browser";
}

interface OverleafDocumentInput {
  documentId: string;
  projectId: string;
  title: string;
  documentType: Document["documentType"];
  textContent?: string;
  url?: string;
  updatedAt?: string;
}

const mapProject = (item: OverleafProjectInput): BrainEntity => {
  const data: Project = {
    id: makeEntityId("project", "overleaf", item.projectId),
    name: item.name,
    status: "active",
    organizations: [],
    repoIds: [],
    documentIds: [],
  };

  return normalizeEntity({
    entityType: "project",
    source: "overleaf",
    sourceRecordId: item.projectId,
    sourceUrl: item.url,
    data,
    rawPayload: item,
  });
};

const mapDocument = (item: OverleafDocumentInput): BrainEntity => {
  const data: Document = {
    id: makeEntityId("document", "overleaf", item.documentId),
    title: item.title,
    documentType: item.documentType,
    textContent: item.textContent,
    url: item.url,
    updatedAt: item.updatedAt,
  };

  return normalizeEntity({
    entityType: "document",
    source: "overleaf",
    sourceRecordId: item.documentId,
    sourceUrl: item.url,
    data,
    rawPayload: item,
  });
};

const discoverFromUrls = (context: ConnectorContext): OverleafProjectInput[] => {
  const sourceUrls = context.sources.overleafProjectUrls;
  const hasGitAuth = Boolean(context.sources.overleafGitToken && context.sources.overleafEmail);
  return sourceUrls.map((url, index) => ({
    projectId: `project-${index + 1}`,
    name: `Overleaf Project ${index + 1}`,
    url,
    authMode: hasGitAuth ? "git-token" : "browser",
  }));
};

const discoverFromAccount = (context: ConnectorContext): OverleafProjectInput[] => {
  if (!context.sources.overleafEmail) {
    return [];
  }

  // Account-level discovery entry point.
  // Real project enumeration is expected to be connected with the browser automation pipeline.
  return [
    {
      projectId: `account:${context.sources.overleafEmail}`,
      name: "Overleaf Account Projects",
      url: "https://www.overleaf.com/project",
      authMode: "git-token",
    },
  ];
};

const buildOverleafDocuments = (
  context: ConnectorContext,
  projects: OverleafProjectInput[]
): OverleafDocumentInput[] => {
  const documents: OverleafDocumentInput[] = [];

  if (projects.length > 0) {
    documents.push({
      documentId: "overleaf-account-summary",
      projectId: projects[0].projectId,
      title: "Overleaf Knowledge Summary",
      documentType: "notes",
      url: "https://www.overleaf.com/project",
      textContent: [
        "This is the Overleaf summary node for the digital brain.",
        `Discovery mode: ${context.sources.overleafDiscoveryMode}`,
        `Account email: ${context.sources.overleafEmail ?? "not provided"}`,
        `Configured project URLs: ${context.sources.overleafProjectUrls.length}`,
        "If project URLs are added, each URL is represented as an Overleaf project entity.",
      ].join("\n"),
    });
  }

  for (const project of projects) {
    documents.push({
      documentId: `overleaf-project-note:${project.projectId}`,
      projectId: project.projectId,
      title: `${project.name} Notes`,
      documentType: "notes",
      url: project.url,
      textContent: [
        `Project: ${project.name}`,
        `Auth mode: ${project.authMode ?? "unknown"}`,
        `Project URL: ${project.url ?? "not available"}`,
      ].join("\n"),
    });
  }

  return documents;
};

const fetchOverleafBrowserData = async (context: ConnectorContext): Promise<{
  projects: OverleafProjectInput[];
  documents: OverleafDocumentInput[];
}> => {
  const inferredProjects =
    context.sources.overleafDiscoveryMode === "account"
      ? discoverFromAccount(context)
      : discoverFromUrls(context);

  return {
    projects: inferredProjects,
    documents: buildOverleafDocuments(context, inferredProjects),
  };
};

export const overleafBrowserConnector: SourceConnector = {
  name: "overleaf-browser",
  async collect(context: ConnectorContext): Promise<BrainEntity[]> {
    const payload = await fetchOverleafBrowserData(context);
    return [...payload.projects.map(mapProject), ...payload.documents.map(mapDocument)];
  },
};
