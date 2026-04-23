import type { BrainEntity, PrivacyMode } from "../types/schema";
import { withPrivacy } from "../core/normalize";

export interface NotionUpsertClient {
  upsertEntity(input: {
    entityType: string;
    externalId: string;
    source: string;
    sourceRecordId: string;
    sourceUrl?: string;
    observedAt: string;
    lastSyncedAt: string;
    payload: unknown;
  }): Promise<void>;
}

interface NotionWriterOptions {
  privacyMode: PrivacyMode;
  client: NotionUpsertClient;
}

export class NotionWriter {
  private readonly options: NotionWriterOptions;

  constructor(options: NotionWriterOptions) {
    this.options = options;
  }

  async upsert(entity: BrainEntity): Promise<void> {
    const rawPayload = withPrivacy(entity.rawPayload, this.options.privacyMode, "notion");
    await this.options.client.upsertEntity({
      entityType: entity.entityType,
      externalId: entity.externalId,
      source: entity.source,
      sourceRecordId: entity.sourceRecordId,
      sourceUrl: entity.sourceUrl,
      observedAt: entity.observedAt,
      lastSyncedAt: entity.lastSyncedAt,
      payload: {
        normalized: entity.data,
        rawPayload,
      },
    });
  }
}
