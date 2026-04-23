import { makeEntityId } from "./id";
import type { BrainEntity, BrainEntityData, EntityType, PrivacyMode } from "../types/schema";

interface NormalizeInput {
  entityType: EntityType;
  source: string;
  sourceRecordId: string;
  sourceUrl?: string;
  data: BrainEntityData;
  rawPayload?: unknown;
}

const nowIso = (): string => new Date().toISOString();

export const withPrivacy = (
  rawPayload: unknown,
  privacyMode: PrivacyMode,
  destination: "local" | "notion"
): unknown => {
  if (privacyMode === "full_raw") {
    return rawPayload;
  }

  if (privacyMode === "hybrid" && destination === "local") {
    return rawPayload;
  }

  return undefined;
};

export const buildExternalId = (entityType: EntityType, sourceRecordId: string, source: string): string => {
  switch (entityType) {
    case "person":
      return makeEntityId("person", source, sourceRecordId);
    case "organization":
      return makeEntityId("organization", source, sourceRecordId);
    case "project":
      return makeEntityId("project", source, sourceRecordId);
    case "repo":
      return makeEntityId("repo", source, sourceRecordId);
    case "commit_activity":
      return makeEntityId("commit", source, sourceRecordId);
    case "post":
      return makeEntityId("post", source, sourceRecordId);
    case "document":
      return makeEntityId("document", source, sourceRecordId);
    case "skill":
      return makeEntityId("skill", sourceRecordId);
    case "automation_profile":
      return makeEntityId("automation", sourceRecordId);
    default: {
      const exhaustiveCheck: never = entityType;
      return exhaustiveCheck;
    }
  }
};

export const normalizeEntity = (input: NormalizeInput): BrainEntity => {
  const timestamp = nowIso();
  return {
    entityType: input.entityType,
    externalId: buildExternalId(input.entityType, input.sourceRecordId, input.source),
    source: input.source,
    sourceRecordId: input.sourceRecordId,
    sourceUrl: input.sourceUrl,
    observedAt: timestamp,
    lastSyncedAt: timestamp,
    rawPayload: input.rawPayload,
    data: input.data,
  };
};
