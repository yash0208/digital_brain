# Digital Brain Data Schema

This schema is the canonical contract for ingestion, normalization, and storage.
Every entity uses deterministic IDs so the brain can be recreated and updated by any operator.

## Core Principles

- Deterministic IDs from stable source keys (never random UUIDs for persistent entities).
- Source-aware references (`source`, `sourceRecordId`, `sourceUrl`) on every ingested record.
- Upsert-only persistence by `externalId`.
- Full raw payload retention is allowed locally (configured by privacy mode).

## Entity Types

### person
- `id`: `person:{hash(email|username)}`
- `displayName`
- `emails[]`
- `usernames[]`
- `headline`
- `bio`
- `locations[]`
- `links[]`

### organization
- `id`: `organization:{hash(source:sourceRecordId)}`
- `name`
- `handle`
- `type` (`company` | `community` | `university` | `other`)
- `links[]`

### project
- `id`: `project:{hash(source:sourceRecordId)}`
- `name`
- `summary`
- `status` (`active` | `paused` | `archived` | `unknown`)
- `organizations[]`
- `repoIds[]`
- `documentIds[]`

### repo
- `id`: `repo:{hash(host:owner:name)}`
- `host` (`github` | `gitlab` | `local`)
- `owner`
- `name`
- `defaultBranch`
- `visibility` (`public` | `private` | `unknown`)
- `url`
- `languages[]`
- `topics[]`

### commit_activity
- `id`: `commit:{hash(repoId:commitSha)}`
- `repoId`
- `commitSha`
- `authorName`
- `authorEmail`
- `authoredAt`
- `message`
- `branch`
- `url`

### post
- `id`: `post:{hash(source:sourceRecordId)}`
- `platform` (`linkedin` | `github` | `other`)
- `title`
- `body`
- `publishedAt`
- `url`
- `engagement` (optional source metrics)

### document
- `id`: `document:{hash(source:sourceRecordId)}`
- `title`
- `documentType` (`resume` | `paper` | `cover_letter` | `notes` | `other`)
- `sourcePath`
- `url`
- `updatedAt`
- `textContent`

### skill
- `id`: `skill:{hash(normalizedName)}`
- `name`
- `category`
- `level` (`learning` | `intermediate` | `advanced` | `expert` | `unknown`)
- `evidenceIds[]`

### automation_profile
- `id`: `automation:{hash(profileName)}`
- `profileName`
- `preferredLocales[]`
- `preferredFormAnswers` (key/value map)
- `constraints[]`

## Metadata Envelope

All entities are wrapped with the metadata envelope:

- `entityType`
- `externalId` (same as canonical `id`)
- `source`
- `sourceRecordId`
- `sourceUrl`
- `observedAt`
- `lastSyncedAt`
- `rawPayload` (stored according to privacy mode)

