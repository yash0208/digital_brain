import { makeEntityId } from "./id";
import { normalizeEntity } from "./normalize";
import { generateMarkdownWithOpenAIDetailed } from "./openai";
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

const isDocument = (entity: BrainEntity): entity is BrainEntity & { data: Document } =>
  entity.entityType === "document";

interface ModelFriendlyBrainOptions {
  openaiApiKey?: string;
  openaiModel: string;
  onLog?: (message: string) => void;
  openaiProjectComparisonSince?: string;
}

interface OpenAIGenerationStats {
  projectDocsGeneratedWithOpenAI: number;
  projectDocsFallbackUsed: number;
  personaGeneratedWithOpenAI: boolean;
  personaFallbackUsed: boolean;
  projectOpenAIFailureReasons: string[];
  personaOpenAIFailureReason?: string;
}

interface ModelFriendlyBrainResult {
  entities: BrainEntity[];
  stats: OpenAIGenerationStats;
}

const mapWithConcurrency = async <TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> => {
  if (items.length === 0) return [];
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  };

  await Promise.all(Array.from({ length: safeConcurrency }, () => runWorker()));
  return results;
};

const getRepoPushedAt = (entity: BrainEntity & { data: Repo }): string | undefined => {
  const payload = entity.rawPayload as { pushedAt?: unknown } | undefined;
  return typeof payload?.pushedAt === "string" ? payload.pushedAt : undefined;
};

const hasProjectRepoChangedSince = (
  project: BrainEntity & { data: Project },
  repoEntities: Array<BrainEntity & { data: Repo }>,
  since?: string
): boolean => {
  if (!since) return true;
  const sinceDate = new Date(since);
  if (Number.isNaN(sinceDate.getTime())) return true;
  const projectRepos = repoEntities.filter((repo) => project.data.repoIds.includes(repo.data.id));
  if (!projectRepos.length) return true;
  return projectRepos.some((repo) => {
    const pushedAt = getRepoPushedAt(repo);
    if (!pushedAt) return true;
    const pushedDate = new Date(pushedAt);
    if (Number.isNaN(pushedDate.getTime())) return true;
    return pushedDate > sinceDate;
  });
};

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
  commits: CommitActivity[],
  supportingDocs: Document[]
): string => {
  const recentCommits = commits
    .filter((commit) => project.data.repoIds.includes(commit.repoId))
    .sort((a, b) => (b.authoredAt ?? "").localeCompare(a.authoredAt ?? ""))
    .slice(0, 20);

  const stack = Array.from(new Set(projectRepos.flatMap((repo) => repo.languages.concat(repo.topics))));
  const architecture = projectRepos.map((repo) => `${repo.owner}/${repo.name}`).join(", ") || "No repository linked";
  const supportingEvidence = supportingDocs
    .map((doc) => `- ${doc.title}`)
    .slice(0, 8)
    .join("\n");

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
    "## Supporting Evidence",
    supportingEvidence || "- No supporting documents linked yet",
    "",
  ].join("\n");
};

const buildProjectPrompt = (
  project: BrainEntity & { data: Project },
  projectRepos: Repo[],
  commits: CommitActivity[],
  supportingDocs: Document[],
  fallbackMarkdown: string
): string => {
  const recentCommits = commits
    .filter((commit) => project.data.repoIds.includes(commit.repoId))
    .sort((a, b) => (b.authoredAt ?? "").localeCompare(a.authoredAt ?? ""))
    .slice(0, 40)
    .map((commit) => `${commit.authoredAt ?? "unknown-date"} | ${commit.repoId} | ${commit.message ?? "no message"}`)
    .join("\n");

  const repoContext = projectRepos
    .map(
      (repo) =>
        `- ${repo.owner}/${repo.name}\n  languages: ${repo.languages.join(", ") || "N/A"}\n  topics: ${repo.topics.join(", ") || "N/A"}\n  summary: ${repo.summary ?? "N/A"}`
    )
    .join("\n");

  const documentContext = supportingDocs
    .slice(0, 10)
    .map((doc) => `- ${doc.title}\n${(doc.textContent ?? "").slice(0, 1200)}`)
    .join("\n\n");

  return [
    "You are generating a highly informative project brain markdown document.",
    "Use only provided facts. If something is unclear, explicitly state 'Not clearly identified from available signals.'",
    "Write concrete, detailed, and model-friendly content. Avoid fluff.",
    "Use this exact section structure:",
    "1) Project Overview",
    "2) Product and User Use Cases",
    "3) System Architecture and Components",
    "4) Data Model and Data Flow",
    "5) Technology Stack and Why It Matters",
    "6) Build/Run/Deploy Workflow",
    "7) Active Workstreams and Recent Progress",
    "8) Risks, Gaps, and Next Best Improvements",
    "",
    `Project Name: ${project.data.name}`,
    `Project Status: ${project.data.status}`,
    `Project Summary Signal: ${project.data.summary ?? "N/A"}`,
    "",
    "Repository Context:",
    repoContext || "N/A",
    "",
    "Recent Commit Context:",
    recentCommits || "N/A",
    "",
    "Supporting Documents Context:",
    documentContext || "N/A",
    "",
    "Baseline fallback markdown (improve and expand this with evidence):",
    fallbackMarkdown,
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

const buildPersonaPrompt = (
  repos: Repo[],
  posts: Post[],
  commits: CommitActivity[],
  fallbackMarkdown: string
): string => {
  const repoLines = repos
    .slice(0, 60)
    .map(
      (repo) =>
        `- ${repo.owner}/${repo.name} | languages=${repo.languages.join(", ") || "N/A"} | topics=${repo.topics.join(", ") || "N/A"} | summary=${repo.summary ?? "N/A"}`
    )
    .join("\n");
  const postLines = posts
    .slice(0, 60)
    .map((post) => `- ${post.publishedAt ?? "unknown-date"} | ${(post.body ?? "").slice(0, 240)}`)
    .join("\n");
  const commitLines = commits
    .slice(0, 100)
    .map((commit) => `- ${commit.authoredAt ?? "unknown-date"} | ${commit.message ?? "no message"}`)
    .join("\n");

  return [
    "You are generating a detailed persona and working-style brain markdown document.",
    "Infer carefully from evidence; do not invent facts.",
    "If uncertain, state 'Not clearly identified from available signals.'",
    "Write this section structure:",
    "1) Professional Identity Snapshot",
    "2) Core Engineering Domains",
    "3) Technical Depth Map (languages, frameworks, systems)",
    "4) Product/Problem Interests",
    "5) Working Style and Execution Patterns",
    "6) Communication/Public Thought Signals (LinkedIn)",
    "7) Collaboration and Leadership Signals",
    "8) Strategic Growth Areas and Suggested Next Bets",
    "",
    "Repository Evidence:",
    repoLines || "N/A",
    "",
    "LinkedIn Evidence:",
    postLines || "N/A",
    "",
    "Commit Evidence:",
    commitLines || "N/A",
    "",
    "Baseline fallback markdown (improve and expand this with evidence):",
    fallbackMarkdown,
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

export const buildModelFriendlyBrain = async (
  entities: BrainEntity[],
  options: ModelFriendlyBrainOptions
): Promise<ModelFriendlyBrainResult> => {
  const hasOpenAI = Boolean(options.openaiApiKey && options.openaiModel);
  options.onLog?.(
    hasOpenAI
      ? `openai:enabled model=${options.openaiModel}`
      : "openai:disabled missing OPENAI_API_KEY or OPENAI_MODEL"
  );

  const repoEntities = entities.filter(isRepo);
  const repos = repoEntities.map((entity) => entity.data);
  const projects = entities.filter(isProject);
  const posts = entities.filter(isPost).map((entity) => entity.data);
  const commits = entities.filter(isCommit).map((entity) => entity.data);
  const documents = entities.filter(isDocument).map((entity) => entity.data);

  let projectDocsGeneratedWithOpenAI = 0;
  let projectDocsFallbackUsed = 0;
  let projectOpenAIFailureReasons = new Map<string, number>();
  const projectTotal = projects.length;
  let projectCompleted = 0;
  const projectBrainDocs = await mapWithConcurrency(projects, hasOpenAI ? 3 : 1, async (projectEntity) => {
      const projectRepos = repos.filter((repo) => projectEntity.data.repoIds.includes(repo.id));
      const supportingDocs = documents.filter((doc) => {
        const docText = `${doc.title}\n${doc.textContent ?? ""}`.toLowerCase();
        if (docText.includes(projectEntity.data.name.toLowerCase())) return true;
        return projectRepos.some((repo) => docText.includes(repo.name.toLowerCase()));
      });
      const fallbackMarkdown = buildProjectBrainDoc(projectEntity, projectRepos, commits, supportingDocs);
      const prompt = buildProjectPrompt(
        projectEntity,
        projectRepos,
        commits,
        supportingDocs,
        fallbackMarkdown
      );
      let aiMarkdown: string | undefined;
      let failureReason: string | undefined;
      const repoChanged = hasProjectRepoChangedSince(
        projectEntity,
        repoEntities,
        options.openaiProjectComparisonSince
      );
      if (options.openaiApiKey && options.openaiModel && repoChanged) {
        const aiResult = await generateMarkdownWithOpenAIDetailed(
          options.openaiApiKey,
          options.openaiModel,
          prompt
        );
        aiMarkdown = aiResult.text;
        if (!aiResult.ok) {
          failureReason =
            aiResult.error ??
            (aiResult.status ? `HTTP ${aiResult.status}` : "OpenAI call failed without details");
        }
      } else if (options.openaiApiKey && options.openaiModel && !repoChanged) {
        failureReason = "Skipped OpenAI: repo unchanged since previous OpenAI run";
      }
      if (aiMarkdown) {
        projectDocsGeneratedWithOpenAI += 1;
      } else {
        projectDocsFallbackUsed += 1;
        if (failureReason) {
          const key = failureReason.slice(0, 180);
          projectOpenAIFailureReasons.set(key, (projectOpenAIFailureReasons.get(key) ?? 0) + 1);
        }
      }
      projectCompleted += 1;
      if (hasOpenAI && (projectCompleted === 1 || projectCompleted % 10 === 0 || projectCompleted === projectTotal)) {
        options.onLog?.(
          `openai:projectDocs progress=${projectCompleted}/${projectTotal} generated=${projectDocsGeneratedWithOpenAI} fallback=${projectDocsFallbackUsed}`
        );
      }
      const markdown = aiMarkdown ?? fallbackMarkdown;
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
  const fallbackPersonaHub = buildPersonaHub(repos, posts, commits);
  const personaPrompt = buildPersonaPrompt(repos, posts, commits, fallbackPersonaHub);
  let aiPersonaHub: string | undefined;
  let personaOpenAIFailureReason: string | undefined;
  const anyRepoChangedSinceOpenAiRun = projects.some((project) =>
    hasProjectRepoChangedSince(project, repoEntities, options.openaiProjectComparisonSince)
  );
  if (options.openaiApiKey && options.openaiModel && anyRepoChangedSinceOpenAiRun) {
    options.onLog?.("openai:persona progress=0/1");
    const personaResult = await generateMarkdownWithOpenAIDetailed(
      options.openaiApiKey,
      options.openaiModel,
      personaPrompt
    );
    aiPersonaHub = personaResult.text;
    if (!personaResult.ok) {
      personaOpenAIFailureReason =
        personaResult.error ??
        (personaResult.status ? `HTTP ${personaResult.status}` : "OpenAI call failed without details");
    }
    options.onLog?.(
      `openai:persona progress=1/1 generated=${personaResult.ok ? 1 : 0} fallback=${
        personaResult.ok ? 0 : 1
      }`
    );
  } else if (options.openaiApiKey && options.openaiModel && !anyRepoChangedSinceOpenAiRun) {
    personaOpenAIFailureReason = "Skipped OpenAI: no repo changes since previous OpenAI run";
    options.onLog?.("openai:persona progress=1/1 generated=0 fallback=1");
  }
  const personaGeneratedWithOpenAI = Boolean(aiPersonaHub);
  const personaFallbackUsed = !personaGeneratedWithOpenAI;
  const personaHub = makeBrainDocumentEntity(
    "Persona and Working Style",
    "hub:persona",
    aiPersonaHub ?? fallbackPersonaHub
  );
  options.onLog?.(
    `openai:projectDocs generated=${projectDocsGeneratedWithOpenAI} fallback=${projectDocsFallbackUsed}`
  );
  if (projectOpenAIFailureReasons.size > 0) {
    const topReasons = Array.from(projectOpenAIFailureReasons.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason, count]) => `${count}x ${reason}`)
      .join(" | ");
    options.onLog?.(`openai:projectDocs failures=${topReasons}`);
  }
  options.onLog?.(
    `openai:persona generated=${personaGeneratedWithOpenAI ? 1 : 0} fallback=${
      personaFallbackUsed ? 1 : 0
    }`
  );
  if (personaOpenAIFailureReason) {
    options.onLog?.(`openai:persona failure=${personaOpenAIFailureReason.slice(0, 220)}`);
  }

  // Commit entities are intentionally removed from file output and merged into project/persona docs.
  const finalEntities = [
    ...entities.filter((entity) => entity.entityType !== "commit_activity"),
    ...projectBrainDocs,
    githubHub,
    linkedinHub,
    personaHub,
  ];
  return {
    entities: finalEntities,
    stats: {
      projectDocsGeneratedWithOpenAI,
      projectDocsFallbackUsed,
      personaGeneratedWithOpenAI,
      personaFallbackUsed,
      projectOpenAIFailureReasons: Array.from(projectOpenAIFailureReasons.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => `${count}x ${reason}`),
      personaOpenAIFailureReason,
    },
  };
};
