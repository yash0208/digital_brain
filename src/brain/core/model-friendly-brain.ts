import { makeEntityId } from "./id";
import { normalizeEntity } from "./normalize";
import type {
  BrainEntity,
  CommitActivity,
  Document,
  Post,
  Project,
  Repo,
} from "../types/schema";

const isCommit = (entity: BrainEntity): entity is BrainEntity & { data: CommitActivity } =>
  entity.entityType === "commit_activity";

const isProject = (entity: BrainEntity): entity is BrainEntity & { data: Project } =>
  entity.entityType === "project";

const isRepo = (entity: BrainEntity): entity is BrainEntity & { data: Repo } =>
  entity.entityType === "repo";

const isPost = (entity: BrainEntity): entity is BrainEntity & { data: Post } =>
  entity.entityType === "post";

const topWords = (texts: string[], skip = 10): string[] => {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "your",
    "have",
    "into",
    "about",
    "build",
    "project",
    "update",
    "feat",
    "fix",
    "refactor",
  ]);
  const counts = new Map<string, number>();
  for (const text of texts) {
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !stopWords.has(token));
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, skip)
    .map(([word]) => word);
};

const buildProjectBrainDoc = (
  project: BrainEntity & { data: Project },
  projectRepos: Repo[],
  commits: CommitActivity[]
): string => {
  const recentCommits = commits
    .filter((commit) => project.data.repoIds.includes(commit.repoId))
    .sort((a, b) => (b.authoredAt ?? "").localeCompare(a.authoredAt ?? ""))
    .slice(0, 20);

  const stack = Array.from(new Set(projectRepos.flatMap((repo) => repo.languages.concat(repo.topics))));
  const architecture = projectRepos.map((repo) => `${repo.owner}/${repo.name}`).join(", ") || "No repository linked";

  return [
    `# ${project.data.name} Brain`,
    "",
    "## Project Purpose",
    project.data.summary ?? "Purpose not clearly identified yet.",
    "",
    "## Architecture",
    `- Repositories: ${architecture}`,
    `- Status: ${project.data.status}`,
    "",
    "## Technology + Focus Areas",
    stack.length ? stack.map((item) => `- ${item}`).join("\n") : "- Technology signals not detected",
    "",
    "## Recent Work (Commits merged into project)",
    recentCommits.length
      ? recentCommits
          .map(
            (commit) =>
              `- ${commit.authoredAt ?? "unknown-date"}: ${commit.message ?? "no message"}`
          )
          .join("\n")
      : "- No commit activity captured yet",
    "",
  ].join("\n");
};

const buildGithubHub = (repos: Repo[]): string => {
  const byLanguage = new Map<string, string[]>();
  for (const repo of repos) {
    for (const language of repo.languages) {
      const key = language || "Unknown";
      const current = byLanguage.get(key) ?? [];
      current.push(`${repo.owner}/${repo.name}`);
      byLanguage.set(key, current);
    }
  }

  const languageLines =
    byLanguage.size === 0
      ? "- Language clusters not detected"
      : Array.from(byLanguage.entries())
          .sort((a, b) => b[1].length - a[1].length)
          .map(([language, repoNames]) => `- ${language}: ${repoNames.join(", ")}`)
          .join("\n");

  const topicCounts = new Map<string, number>();
  for (const repo of repos) {
    for (const topic of repo.topics) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }
  const topTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([topic, count]) => `- ${topic}: ${count} repos`)
    .join("\n");

  return [
    "# GitHub Knowledge Hub",
    "",
    "## Main Buckets (GitHub -> Java/Python/AI/etc.)",
    languageLines,
    "",
    "## Top Technical Themes",
    topTopics || "- Topic clusters not detected",
    "",
  ].join("\n");
};

const buildLinkedInHub = (posts: Post[]): string => {
  const texts = posts.map((post) => post.body ?? "").filter(Boolean);
  const signals = topWords(texts);
  return [
    "# LinkedIn Knowledge Hub",
    "",
    "## Posting Themes",
    signals.length ? signals.map((signal) => `- ${signal}`).join("\n") : "- No post themes detected",
    "",
    "## Recent Posts",
    posts
      .slice(0, 30)
      .map(
        (post) =>
          `- ${post.publishedAt ?? "unknown-date"}: ${(post.body ?? "").slice(0, 140)}${post.body && post.body.length > 140 ? "..." : ""}`
      )
      .join("\n") || "- No LinkedIn posts ingested",
    "",
  ].join("\n");
};

const buildPersonaHub = (repos: Repo[], posts: Post[], commits: CommitActivity[]): string => {
  const languages = Array.from(new Set(repos.flatMap((repo) => repo.languages))).filter(Boolean);
  const repoTopics = Array.from(new Set(repos.flatMap((repo) => repo.topics))).filter(Boolean);
  const commitTexts = commits.map((commit) => commit.message ?? "");
  const postTexts = posts.map((post) => post.body ?? "");
  const workStyleSignals = topWords([...commitTexts, ...postTexts], 12);

  return [
    "# Persona and Working Style Brain",
    "",
    "## Core Engineering Domains",
    languages.length ? languages.map((language) => `- ${language}`).join("\n") : "- Domain not inferred",
    "",
    "## Main Interest Areas",
    repoTopics.length ? repoTopics.slice(0, 20).map((topic) => `- ${topic}`).join("\n") : "- Interest areas not inferred",
    "",
    "## Working Style Signals",
    workStyleSignals.length
      ? workStyleSignals.map((signal) => `- ${signal}`).join("\n")
      : "- Working style signals not inferred",
    "",
    `## Activity Summary`,
    `- Repositories analyzed: ${repos.length}`,
    `- LinkedIn posts analyzed: ${posts.length}`,
    `- Commits analyzed: ${commits.length}`,
    "",
  ].join("\n");
};

const makeBrainDocumentEntity = (title: string, recordId: string, content: string): BrainEntity => {
  const data: Document = {
    id: makeEntityId("document", "brain", recordId),
    title,
    documentType: "notes",
    textContent: content,
  };

  return normalizeEntity({
    entityType: "document",
    source: "brain",
    sourceRecordId: recordId,
    data,
    rawPayload: { synthesized: true },
  });
};

export const buildModelFriendlyBrain = (entities: BrainEntity[]): BrainEntity[] => {
  const repos = entities.filter(isRepo).map((entity) => entity.data);
  const projects = entities.filter(isProject);
  const posts = entities.filter(isPost).map((entity) => entity.data);
  const commits = entities.filter(isCommit).map((entity) => entity.data);

  const projectBrainDocs = projects.map((projectEntity) => {
    const projectRepos = repos.filter((repo) => projectEntity.data.repoIds.includes(repo.id));
    const markdown = buildProjectBrainDoc(projectEntity, projectRepos, commits);
    return makeBrainDocumentEntity(
      `${projectEntity.data.name} Project Brain`,
      `project-brain:${projectEntity.externalId}`,
      markdown
    );
  });

  const githubHub = makeBrainDocumentEntity(
    "GitHub Main Knowledge Hub",
    "hub:github",
    buildGithubHub(repos)
  );
  const linkedinHub = makeBrainDocumentEntity(
    "LinkedIn Main Knowledge Hub",
    "hub:linkedin",
    buildLinkedInHub(posts)
  );
  const personaHub = makeBrainDocumentEntity(
    "Persona and Working Style",
    "hub:persona",
    buildPersonaHub(repos, posts, commits)
  );

  // Commit entities are intentionally removed from file output and merged into project/persona docs.
  return [
    ...entities.filter((entity) => entity.entityType !== "commit_activity"),
    ...projectBrainDocs,
    githubHub,
    linkedinHub,
    personaHub,
  ];
};
