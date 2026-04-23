# Digital Brain Architecture

The system ingests personal/professional context from multiple sources, normalizes it into a canonical model, and writes to both local Markdown storage and Notion.

## Pipeline

1. Source connectors fetch data from GitHub, LinkedIn (browser), Overleaf (browser), and local projects.
2. Normalization layer maps all source payloads to canonical entities and deterministic IDs.
3. Persistence layer upserts entities into:
   - Local Markdown datastore (MDS-style folders)
   - Notion pages/databases through MCP calls
4. Checkpoints and logs support full rebuilds and incremental updates.

## Rebuild Guarantees

- Idempotent upserts by stable `externalId`.
- Incremental mode by per-connector checkpoint timestamps.
- Full mode recreates normalized state without changing IDs.

## Privacy Modes

- `full_raw`: keep raw payloads local and in Notion.
- `summaries_only`: persist normalized summaries only.
- `hybrid`: raw payload local only, summary in Notion.

## Storage Layout

- `brain-store/person/`
- `brain-store/organization/`
- `brain-store/project/`
- `brain-store/repo/`
- `brain-store/commit_activity/`
- `brain-store/post/`
- `brain-store/document/`
- `brain-store/skill/`
- `brain-store/automation_profile/`
- `brain-store/checkpoints/`
- `brain-store/audit/`

