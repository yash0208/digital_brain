import type { BrainEntity } from "../types/schema";

export interface ConnectorContext {
  since?: string;
  sources: {
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
  };
}

export interface SourceConnector {
  name: string;
  collect(context: ConnectorContext): Promise<BrainEntity[]>;
}
