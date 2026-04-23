# Digital Brain

Build and maintain a local + Notion-ready "digital brain" from your work footprint:

- GitHub repos + commits
- LinkedIn profile/posts (browser mode or JSON import mode)
- Overleaf project ingestion hooks
- Local Markdown knowledge store
- Obsidian-style graph visualization

This project is designed to be rerunnable by anyone with credentials and config.

## What This Tool Does

- Ingests source data through connectors.
- Normalizes data into stable entities (`project`, `repo`, `commit_activity`, `document`, etc.).
- Stores entities in local Markdown (`brain-store/`).
- Tracks checkpoints and audits for incremental updates.
- Can enrich project docs/README content using OpenAI.

## Architecture

1. Connectors collect source data.
2. Normalization creates deterministic IDs.
3. Persistence writes markdown entities (and optional Notion upserts).
4. Visualization generates an interactive knowledge graph HTML.

## Prerequisites

- Node.js 18+
- `tsx` available via `npx` (or installed in your project)
- GitHub token for repo/commit ingestion
- Optional OpenAI key for AI-powered project intelligence
- Optional LinkedIn/Overleaf settings depending on your ingestion mode

## Initial Setup

1. Copy environment template:

```bash
cp .env.example .env
```

2. Fill required values in `.env`:

- `GITHUB_TOKEN`
- `GITHUB_USERNAME`
- `BRAIN_MARKDOWN_STORE_DIR`
- `BRAIN_CHECKPOINT_FILE`
- `BRAIN_AUDIT_LOG_FILE`

3. Optional but recommended:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `GITHUB_LOCAL_CLONE_ROOTS`
- `GITHUB_UPDATE_README=true`

## Run Modes

### Full Rebuild

Use this to rebuild from scratch or refresh everything:

```bash
npx tsx src/brain/run.ts full
```

### Incremental Improve Mode

Use this for day-to-day updates after initial setup:

```bash
npx tsx src/brain/run.ts incremental
```

This mode uses connector checkpoints to fetch only new activity where supported (for example, new commits since last sync).

## Visualization

Generate graph artifacts:

```bash
npx tsx src/brain/visualize.ts
```

Then open:

- `brain-store/graph/brain-graph.html`

## LinkedIn Ingestion Options

### Option A: Browser mode

- `LINKEDIN_INGESTION_MODE=browser`
- Requires Playwright and a valid browser session profile path.
- If profile lock issues happen, use JSON mode.

### Option B: JSON mode (recommended fallback)

- `LINKEDIN_INGESTION_MODE=json`
- Set:
  - `LINKEDIN_PROFILE_JSON_PATH`
  - `LINKEDIN_POSTS_JSON_PATH`
- Use templates:
  - `data/templates/linkedin-profile.template.json`
  - `data/templates/linkedin-posts.template.json`

## README Auto-Update for Projects

If `GITHUB_UPDATE_README=true` and local clones are discoverable via `GITHUB_LOCAL_CLONE_ROOTS`, the tool:

- creates missing `README.md` files when needed
- updates a managed section between:
  - `<!-- DIGITAL_BRAIN:START -->`
  - `<!-- DIGITAL_BRAIN:END -->`

This section includes:

- use case
- project purpose
- architecture hints
- technology stack
- data structure context
- run instructions

## How To Keep Improving Over Time

After first full run:

1. Keep `incremental` as your daily/weekly run command.
2. Add newly cloned repos under `GITHUB_LOCAL_CLONE_ROOTS`.
3. Re-run incremental to pick up:
   - new commits
   - newly detected projects
   - README intelligence refresh
4. Regenerate graph after updates.

Suggested cadence:

- `incremental`: daily or every coding session
- `full`: weekly or before major releases

## Debugging

- Connector progress logs are printed with timestamps.
- Audit logs: `brain-store/audit/runs.json`
- Checkpoints: `brain-store/checkpoints/state.json`
- LinkedIn debug assets (screenshots/json): `LINKEDIN_DEBUG_DIR`

## Security Notes

- Never commit `.env`.
- Rotate tokens if exposed.
- Use least-privilege API keys.

