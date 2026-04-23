import type { PrivacyMode } from "./types/schema";

export interface BrainConfig {
  privacyMode: PrivacyMode;
  markdownStoreDir: string;
  checkpointFilePath: string;
  auditLogPath: string;
  continueOnConnectorError: boolean;
  openaiApiKey?: string;
  openaiModel: string;
  githubToken?: string;
  githubUsername?: string;
  githubLocalCloneRoots: string[];
  githubUpdateReadme: boolean;
  linkedinProfileUrl?: string;
  linkedinIngestionMode: "browser" | "json";
  linkedinBrowserUserDataDir?: string;
  linkedinBrowserHeadless: boolean;
  linkedinMaxPosts: number;
  linkedinDebugDir?: string;
  linkedinProfileJsonPath?: string;
  linkedinPostsJsonPath?: string;
  overleafGitToken?: string;
  overleafEmail?: string;
  overleafDiscoveryMode: "account" | "urls";
  overleafProjectUrls: string[];
}

const required = (value: string | undefined, key: string): string => {
  if (!value) {
    throw new Error(`Missing required config: ${key}`);
  }
  return value;
};

const splitCsv = (value: string | undefined): string[] =>
  value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

export const loadConfig = (): BrainConfig => {
  const privacyMode = (process.env.BRAIN_PRIVACY_MODE ?? "full_raw") as PrivacyMode;
  const linkedinMaxPostsRaw = Number(process.env.LINKEDIN_MAX_POSTS ?? "30");
  return {
    privacyMode,
    markdownStoreDir: required(process.env.BRAIN_MARKDOWN_STORE_DIR, "BRAIN_MARKDOWN_STORE_DIR"),
    checkpointFilePath: required(process.env.BRAIN_CHECKPOINT_FILE, "BRAIN_CHECKPOINT_FILE"),
    auditLogPath: required(process.env.BRAIN_AUDIT_LOG_FILE, "BRAIN_AUDIT_LOG_FILE"),
    continueOnConnectorError: process.env.BRAIN_CONTINUE_ON_CONNECTOR_ERROR !== "false",
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    githubToken: process.env.GITHUB_TOKEN,
    githubUsername: process.env.GITHUB_USERNAME,
    githubLocalCloneRoots: splitCsv(process.env.GITHUB_LOCAL_CLONE_ROOTS),
    githubUpdateReadme: process.env.GITHUB_UPDATE_README !== "false",
    linkedinProfileUrl: process.env.LINKEDIN_PROFILE_URL,
    linkedinIngestionMode: (process.env.LINKEDIN_INGESTION_MODE ?? "browser") as "browser" | "json",
    linkedinBrowserUserDataDir: process.env.LINKEDIN_BROWSER_USER_DATA_DIR,
    linkedinBrowserHeadless: process.env.LINKEDIN_BROWSER_HEADLESS === "true",
    linkedinMaxPosts: Number.isFinite(linkedinMaxPostsRaw) && linkedinMaxPostsRaw > 0 ? linkedinMaxPostsRaw : 30,
    linkedinDebugDir: process.env.LINKEDIN_DEBUG_DIR,
    linkedinProfileJsonPath: process.env.LINKEDIN_PROFILE_JSON_PATH,
    linkedinPostsJsonPath: process.env.LINKEDIN_POSTS_JSON_PATH,
    overleafGitToken: process.env.OVERLEAF_GIT_TOKEN,
    overleafEmail: process.env.OVERLEAF_EMAIL,
    overleafDiscoveryMode: (process.env.OVERLEAF_DISCOVERY_MODE ?? "account") as "account" | "urls",
    overleafProjectUrls: splitCsv(process.env.OVERLEAF_PROJECT_URLS),
  };
};
