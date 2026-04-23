import { normalizeEntity } from "../core/normalize";
import { makeEntityId } from "../core/id";
import type { BrainEntity, Repo, CommitActivity, Project, Document } from "../types/schema";
import type { ConnectorContext, SourceConnector } from "./types";
import { access, readFile, writeFile } from "fs/promises";
import { constants } from "fs";
import { join } from "path";
import { generateProjectIntelligenceWithOpenAI } from "../core/openai";

interface GithubRepoInput {
  owner: string;
  name: string;
  url?: string;
  defaultBranch?: string;
  visibility?: "public" | "private";
  description?: string;
  topics: string[];
  languages: string[];
  localPath?: string;
  pushedAt?: string;
}

interface GithubCommitInput {
  repoOwner: string;
  repoName: string;
  sha: string;
  message?: string;
  authoredAt?: string;
  authorName?: string;
  authorEmail?: string;
  url?: string;
}

interface GithubApiRepo {
  name: string;
  html_url: string;
  default_branch?: string;
  private?: boolean;
  description?: string | null;
  owner?: {
    login?: string;
  };
  topics?: string[];
  language?: string | null;
  pushed_at?: string | null;
}

interface GithubApiCommit {
  sha: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: {
      name?: string;
      email?: string;
      date?: string;
    };
  };
}

const mapRepo = (item: GithubRepoInput): BrainEntity => {
  const repoKey = `github:${item.owner}:${item.name}`;
  const data: Repo = {
    id: makeEntityId("repo", "github", item.owner, item.name),
    host: "github",
    owner: item.owner,
    name: item.name,
    defaultBranch: item.defaultBranch,
    visibility: item.visibility ?? "unknown",
    url: item.url,
    languages: item.languages,
    topics: item.topics,
  };

  return normalizeEntity({
    entityType: "repo",
    source: "github",
    sourceRecordId: repoKey,
    sourceUrl: item.url,
    data,
    rawPayload: item,
  });
};

const mapProject = (item: GithubRepoInput): BrainEntity => {
  const repoId = makeEntityId("repo", "github", item.owner, item.name);
  const data: Project = {
    id: makeEntityId("project", "github", item.owner, item.name),
    name: item.name,
    summary: item.description,
    status: "active",
    organizations: [],
    repoIds: [repoId],
    documentIds: [],
  };

  return normalizeEntity({
    entityType: "project",
    source: "github",
    sourceRecordId: `${item.owner}/${item.name}`,
    sourceUrl: item.url,
    data,
    rawPayload: item,
  });
};

const mapProjectDocument = (
  item: GithubRepoInput,
  content: string
): BrainEntity => {
  const documentId = makeEntityId("document", "github", item.owner, item.name, "project-intelligence");
  const data: Document = {
    id: documentId,
    title: `${item.owner}/${item.name} Project Intelligence`,
    documentType: "notes",
    sourcePath: item.localPath,
    url: item.url,
    textContent: content,
  };

  return normalizeEntity({
    entityType: "document",
    source: "github",
    sourceRecordId: `${item.owner}/${item.name}:project-intelligence`,
    sourceUrl: item.url,
    data,
    rawPayload: { generated: true },
  });
};

const mapCommit = (item: GithubCommitInput): BrainEntity => {
  const repoId = makeEntityId("repo", "github", item.repoOwner, item.repoName);
  const data: CommitActivity = {
    id: makeEntityId("commit", repoId, item.sha),
    repoId,
    commitSha: item.sha,
    message: item.message,
    authoredAt: item.authoredAt,
    authorName: item.authorName,
    authorEmail: item.authorEmail,
    url: item.url,
  };

  return normalizeEntity({
    entityType: "commit_activity",
    source: "github",
    sourceRecordId: `${item.repoOwner}/${item.repoName}:${item.sha}`,
    sourceUrl: item.url,
    data,
    rawPayload: item,
  });
};

const githubFetch = async <T>(
  path: string,
  token: string
): Promise<T> => {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "digital-brain-ingestor",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error ${response.status} on ${path}: ${text}`);
  }

  return (await response.json()) as T;
};

const mapApiRepo = (repo: GithubApiRepo): GithubRepoInput => {
  const owner = repo.owner?.login ?? "unknown";
  return {
    owner,
    name: repo.name,
    url: repo.html_url,
    defaultBranch: repo.default_branch,
    visibility: repo.private ? "private" : "public",
    description: repo.description ?? undefined,
    topics: repo.topics ?? [],
    languages: repo.language ? [repo.language] : [],
    pushedAt: repo.pushed_at ?? undefined,
  };
};

const mapApiCommit = (
  owner: string,
  repoName: string,
  commit: GithubApiCommit
): GithubCommitInput => ({
  repoOwner: owner,
  repoName,
  sha: commit.sha,
  message: commit.commit?.message,
  authoredAt: commit.commit?.author?.date,
  authorName: commit.commit?.author?.name,
  authorEmail: commit.commit?.author?.email,
  url: commit.html_url,
});

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const safeReadText = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
};

const tryResolveLocalRepoPath = async (
  roots: string[],
  owner: string,
  name: string
): Promise<string | undefined> => {
  for (const root of roots) {
    const candidates = [
      join(root, name),
      join(root, `${owner}-${name}`),
      join(root, owner, name),
    ];
    for (const candidate of candidates) {
      if (await fileExists(join(candidate, ".git"))) {
        return candidate;
      }
    }
  }
  return undefined;
};

const detectTechStack = async (repoPath?: string): Promise<string[]> => {
  if (!repoPath) return [];
  const checks: Array<{ path: string; tech: string }> = [
    { path: "package.json", tech: "Node.js" },
    { path: "pnpm-lock.yaml", tech: "pnpm" },
    { path: "yarn.lock", tech: "Yarn" },
    { path: "requirements.txt", tech: "Python" },
    { path: "pyproject.toml", tech: "Python" },
    { path: "go.mod", tech: "Go" },
    { path: "Cargo.toml", tech: "Rust" },
    { path: "pom.xml", tech: "Java Maven" },
    { path: "build.gradle", tech: "Gradle" },
    { path: "Dockerfile", tech: "Docker" },
    { path: "docker-compose.yml", tech: "Docker Compose" },
    { path: "next.config.js", tech: "Next.js" },
    { path: "next.config.ts", tech: "Next.js" },
    { path: "vite.config.ts", tech: "Vite" },
    { path: "angular.json", tech: "Angular" },
    { path: "pubspec.yaml", tech: "Flutter" },
    { path: "firebase.json", tech: "Firebase" },
    { path: "prisma/schema.prisma", tech: "Prisma" },
  ];

  const found: string[] = [];
  for (const check of checks) {
    if (await fileExists(join(repoPath, check.path))) {
      found.push(check.tech);
    }
  }
  return Array.from(new Set(found));
};

const extractRunInstructions = async (repoPath?: string): Promise<string[]> => {
  if (!repoPath) return [];
  const packageJsonText = await safeReadText(join(repoPath, "package.json"));
  if (!packageJsonText) return [];

  try {
    const parsed = JSON.parse(packageJsonText) as { scripts?: Record<string, string> };
    const scripts = parsed.scripts ?? {};
    const preferred = ["dev", "start", "build", "test"];
    return preferred.filter((key) => Boolean(scripts[key])).map((key) => `npm run ${key}`);
  } catch {
    return [];
  }
};

const extractUseCaseFromReadme = async (repoPath?: string): Promise<string | undefined> => {
  if (!repoPath) return undefined;
  const readme = (await safeReadText(join(repoPath, "README.md"))) ?? (await safeReadText(join(repoPath, "readme.md")));
  if (!readme) return undefined;
  const lines = readme
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"));
  return lines[0];
};

const readReadmeSnippet = async (repoPath?: string): Promise<string | undefined> => {
  if (!repoPath) return undefined;
  const readme = (await safeReadText(join(repoPath, "README.md"))) ?? (await safeReadText(join(repoPath, "readme.md")));
  if (!readme) return undefined;
  return readme.slice(0, 3000);
};

const extractArchitectureHint = async (repoPath?: string): Promise<string | undefined> => {
  if (!repoPath) return undefined;
  const hints: Array<{ path: string; text: string }> = [
    { path: "apps", text: "Monorepo with multiple apps." },
    { path: "packages", text: "Shared packages/modules architecture." },
    { path: "src", text: "Source-driven application layout under src/." },
    { path: "server", text: "Server-side component present." },
    { path: "client", text: "Client-side component present." },
    { path: "api", text: "API-oriented structure present." },
    { path: "prisma", text: "Database schema managed with Prisma." },
  ];
  for (const hint of hints) {
    if (await fileExists(join(repoPath, hint.path))) return hint.text;
  }
  return undefined;
};

const buildProjectIntelligenceMarkdown = async (repo: GithubRepoInput): Promise<string> => {
  const tech = await detectTechStack(repo.localPath);
  const run = await extractRunInstructions(repo.localPath);
  const useCase = (await extractUseCaseFromReadme(repo.localPath)) ?? repo.description ?? "Use case not detected yet.";
  const architecture = (await extractArchitectureHint(repo.localPath)) ?? "Architecture hint not detected yet.";

  return [
    `# ${repo.owner}/${repo.name}`,
    "",
    "## Use Case",
    useCase,
    "",
    "## What This Project Does",
    repo.description ?? "Description unavailable from GitHub metadata.",
    "",
    "## Architecture",
    architecture,
    "",
    "## Technology Stack",
    tech.length ? tech.map((item) => `- ${item}`).join("\n") : "- Stack not detected",
    "",
    "## Data Structure",
    "- Repository metadata is mapped into entities: project, repo, commit_activity, document.",
    "- Brain links project -> repo and stores commit history for activity intelligence.",
    "",
    "## How To Run",
    run.length ? run.map((command) => `- ${command}`).join("\n") : "- Run instructions not detected",
    "",
  ].join("\n");
};

const buildLightProjectIntelligenceMarkdown = (repo: GithubRepoInput): string =>
  [
    `# ${repo.owner}/${repo.name}`,
    "",
    "## Use Case",
    repo.description ?? "Use case not detected from latest metadata.",
    "",
    "## What This Project Does",
    repo.description ?? "Description unavailable from GitHub metadata.",
    "",
    "## Architecture",
    "Skipped deep re-analysis because repo has no new commits since last brain sync.",
    "",
    "## Technology Stack",
    repo.languages.length ? repo.languages.map((item) => `- ${item}`).join("\n") : "- Stack not detected",
    "",
    "## Data Structure",
    "- Repository metadata is mapped into entities: project, repo, document.",
    "- Commit history unchanged since previous sync.",
    "",
    "## How To Run",
    "- Preserved from previous known state.",
    "",
  ].join("\n");

const buildProjectIntelligence = async (
  repo: GithubRepoInput,
  context: ConnectorContext
): Promise<string> => {
  const fallback = await buildProjectIntelligenceMarkdown(repo);
  const apiKey = context.sources.openaiApiKey;
  if (!apiKey) return fallback;

  const scripts = await extractRunInstructions(repo.localPath);
  const architectureHint = await extractArchitectureHint(repo.localPath);
  const readmeSnippet = await readReadmeSnippet(repo.localPath);

  const aiResult = await generateProjectIntelligenceWithOpenAI(
    apiKey,
    context.sources.openaiModel,
    {
      repoFullName: `${repo.owner}/${repo.name}`,
      description: repo.description,
      topics: repo.topics,
      languages: repo.languages,
      readmeSnippet,
      packageScripts: scripts,
      architectureHint,
    }
  );

  return aiResult ?? fallback;
};

const upsertReadmeSection = async (repoPath: string, content: string): Promise<void> => {
  const readmePath = join(repoPath, "README.md");
  const markerStart = "<!-- DIGITAL_BRAIN:START -->";
  const markerEnd = "<!-- DIGITAL_BRAIN:END -->";
  const section = [markerStart, "## Digital Brain Project Intelligence", "", content.trim(), markerEnd, ""].join("\n");

  const existing = (await safeReadText(readmePath)) ?? "";
  if (!existing) {
    const initial = [`# ${repoPath.split("/").filter(Boolean).pop() ?? "Project"}`, "", section].join("\n");
    await writeFile(readmePath, initial, "utf8");
    return;
  }

  if (existing.includes(markerStart) && existing.includes(markerEnd)) {
    const updated = existing.replace(
      new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, "m"),
      section.trim()
    );
    await writeFile(readmePath, updated, "utf8");
    return;
  }

  await writeFile(readmePath, `${existing.trim()}\n\n${section}`, "utf8");
};

const fetchGithubData = async (context: ConnectorContext): Promise<{
  repos: GithubRepoInput[];
  commits: GithubCommitInput[];
  projectDocs: Array<{ repo: GithubRepoInput; content: string }>;
}> => {
  const token = context.sources.githubToken;
  const username = context.sources.githubUsername;
  if (!token || !username) {
    return { repos: [], commits: [], projectDocs: [] };
  }

  const sinceQuery = context.since
    ? `&since=${encodeURIComponent(context.since)}`
    : "";

  const reposApi = await githubFetch<GithubApiRepo[]>(
    `/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=owner`,
    token
  );

  const repos = reposApi.map(mapApiRepo);
  const sinceDate = context.since ? new Date(context.since) : undefined;
  const activeRepos = sinceDate
    ? repos.filter((repo) => {
        if (!repo.pushedAt) return true;
        const pushedAt = new Date(repo.pushedAt);
        return Number.isNaN(pushedAt.getTime()) || pushedAt > sinceDate;
      })
    : repos;
  const commits: GithubCommitInput[] = [];
  const projectDocs: Array<{ repo: GithubRepoInput; content: string }> = [];

  const activeRepoKeys = new Set(activeRepos.map((repo) => `${repo.owner}/${repo.name}`));

  for (const repo of activeRepos) {
    repo.localPath = await tryResolveLocalRepoPath(
      context.sources.githubLocalCloneRoots,
      repo.owner,
      repo.name
    );
    const intelligence = await buildProjectIntelligence(repo, context);
    projectDocs.push({ repo, content: intelligence });
    if (repo.localPath && context.sources.githubUpdateReadme) {
      await upsertReadmeSection(repo.localPath, intelligence);
    }
  }

  for (const repo of repos) {
    const key = `${repo.owner}/${repo.name}`;
    if (activeRepoKeys.has(key)) continue;
    projectDocs.push({ repo, content: buildLightProjectIntelligenceMarkdown(repo) });
  }

  // Limit commit ingestion per run for predictable runtime.
  for (const repo of activeRepos.slice(0, 40)) {
    try {
      const commitApi = await githubFetch<GithubApiCommit[]>(
        `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(
          repo.name
        )}/commits?per_page=30${sinceQuery}`,
        token
      );
      commits.push(
        ...commitApi.map((entry) => mapApiCommit(repo.owner, repo.name, entry))
      );
    } catch {
      // Skip repos where commit listing is restricted.
      continue;
    }
  }

  return {
    repos,
    commits,
    projectDocs,
  };
};

export const githubConnector: SourceConnector = {
  name: "github",
  async collect(context: ConnectorContext): Promise<BrainEntity[]> {
    const payload = await fetchGithubData(context);
    return [
      ...payload.repos.map(mapRepo),
      ...payload.repos.map(mapProject),
      ...payload.commits.map(mapCommit),
      ...payload.projectDocs.map((entry) => mapProjectDocument(entry.repo, entry.content)),
    ];
  },
};
