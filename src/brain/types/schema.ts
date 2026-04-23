export type EntityType =
  | "person"
  | "organization"
  | "project"
  | "repo"
  | "commit_activity"
  | "post"
  | "document"
  | "skill"
  | "automation_profile";

export type PrivacyMode = "full_raw" | "summaries_only" | "hybrid";

export interface MetadataEnvelope<T> {
  entityType: EntityType;
  externalId: string;
  source: string;
  sourceRecordId: string;
  sourceUrl?: string;
  observedAt: string;
  lastSyncedAt: string;
  rawPayload?: unknown;
  data: T;
}

export interface Person {
  id: string;
  displayName?: string;
  emails: string[];
  usernames: string[];
  headline?: string;
  bio?: string;
  locations: string[];
  links: string[];
}

export interface Organization {
  id: string;
  name: string;
  handle?: string;
  type: "company" | "community" | "university" | "other";
  links: string[];
}

export interface Project {
  id: string;
  name: string;
  summary?: string;
  status: "active" | "paused" | "archived" | "unknown";
  organizations: string[];
  repoIds: string[];
  documentIds: string[];
}

export interface Repo {
  id: string;
  host: "github" | "gitlab" | "local";
  owner: string;
  name: string;
  defaultBranch?: string;
  visibility: "public" | "private" | "unknown";
  url?: string;
  languages: string[];
  topics: string[];
}

export interface CommitActivity {
  id: string;
  repoId: string;
  commitSha: string;
  authorName?: string;
  authorEmail?: string;
  authoredAt?: string;
  message?: string;
  branch?: string;
  url?: string;
}

export interface Post {
  id: string;
  platform: "linkedin" | "github" | "other";
  title?: string;
  body?: string;
  publishedAt?: string;
  url?: string;
  engagement?: Record<string, number>;
}

export interface Document {
  id: string;
  title: string;
  documentType: "resume" | "paper" | "cover_letter" | "notes" | "other";
  sourcePath?: string;
  url?: string;
  updatedAt?: string;
  textContent?: string;
}

export interface Skill {
  id: string;
  name: string;
  category?: string;
  level: "learning" | "intermediate" | "advanced" | "expert" | "unknown";
  evidenceIds: string[];
}

export interface AutomationProfile {
  id: string;
  profileName: string;
  preferredLocales: string[];
  preferredFormAnswers: Record<string, string>;
  constraints: string[];
}

export type BrainEntityData =
  | Person
  | Organization
  | Project
  | Repo
  | CommitActivity
  | Post
  | Document
  | Skill
  | AutomationProfile;

export type BrainEntity = MetadataEnvelope<BrainEntityData>;
