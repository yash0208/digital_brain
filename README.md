# Digital Brain

Build and maintain a local, model-friendly personal knowledge graph from your work footprint.

## What It Covers

- GitHub repositories and recent commit activity
- LinkedIn profile and posts (browser scrape or JSON import)
- Overleaf account/project signals
- Project intelligence docs + persona hubs
- Interactive graph visualization

The output is optimized for both humans and LLMs: readable markdown docs, hub documents, and explicit interconnections.

## Quick Start

1. Copy env template:
```bash
cp .env.example .env
```

2. Fill required env values (see full env reference below).

3. Run a full build:
```bash
npx tsx src/brain/run.ts full
```

4. Generate graph:
```bash
npx tsx src/brain/visualize.ts
```

5. Open:
- `brain-store/graph/brain-graph.html`

## One Command React UI Workflow

Run everything end-to-end with one script:

```bash
./scripts/run-brain-ui.sh incremental
```

For full refresh:

```bash
./scripts/run-brain-ui.sh full
```

What this script does:
- rebuilds your brain data (`full` or `incremental`)
- regenerates `brain-store/graph/brain-graph-data.json`
- installs `brain-ui` dependencies
- launches the React UI dev server

React UI location:
- `brain-ui/`

## Prerequisites

- Node.js 18+
- `tsx` (`npx tsx ...`)
- GitHub PAT with repo read access
- Optional OpenAI key for richer project intelligence
- Optional Playwright install for LinkedIn browser mode

If using LinkedIn browser mode, install Playwright:
```bash
npm i -D playwright
```

## Environment Variables

### Core (required)

- `BRAIN_MARKDOWN_STORE_DIR`  
  Local output root (default: `./brain-store`)
- `BRAIN_CHECKPOINT_FILE`  
  Checkpoint JSON path (default style: `./brain-store/checkpoints/state.json`)
- `BRAIN_OPENAI_STATE_FILE`  
  OpenAI comparison timestamp checkpoint (default: `./brain-store/checkpoints/openai-state.json`)
- `BRAIN_AUDIT_LOG_FILE`  
  Audit JSON path (default style: `./brain-store/audit/runs.json`)

### Runtime behavior

- `BRAIN_PRIVACY_MODE` = `full_raw` | `summaries_only` | `hybrid`
- `BRAIN_CONTINUE_ON_CONNECTOR_ERROR` = `true` | `false`

### GitHub ingestion (required for useful output)

- `GITHUB_TOKEN`
- `GITHUB_USERNAME`
- `GITHUB_DOCS_SYNC_ENABLED` = `true` | `false`
- `GITHUB_DOCS_REPO_URL` (private/public repo URL for publishing generated docs)
- `GITHUB_DOCS_BRANCH` (default: `main`)
- `GITHUB_DOCS_TARGET_DIR` (default: `brain-docs`)
- `GITHUB_DOCS_SOURCE_DIR` (default: `./brain-store/document`)
- `GITHUB_LOCAL_CLONE_ROOTS` (comma-separated local roots containing cloned repos)
- `GITHUB_UPDATE_README` = `true` | `false`  
  Updates/creates repo README managed section between:
  - `<!-- DIGITAL_BRAIN:START -->`
  - `<!-- DIGITAL_BRAIN:END -->`

### OpenAI enrichment (optional, recommended)

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- quoted and unquoted keys are both supported in `.env`
- OpenAI generation runs only for projects with repo changes after `BRAIN_OPENAI_STATE_FILE` timestamp.

### LinkedIn ingestion

- `LINKEDIN_INGESTION_MODE` = `browser` | `json`
- `LINKEDIN_PROFILE_URL`
- `LINKEDIN_BROWSER_USER_DATA_DIR` (required in browser mode)
- `LINKEDIN_BROWSER_HEADLESS` = `true` | `false`
- `LINKEDIN_MAX_POSTS`
- `LINKEDIN_DEBUG_DIR`
- `LINKEDIN_PROFILE_JSON_PATH` (used in json mode)
- `LINKEDIN_POSTS_JSON_PATH` (used in json mode)

Templates for JSON mode:
- `data/templates/linkedin-profile.template.json`
- `data/templates/linkedin-posts.template.json`

### Overleaf ingestion

- `OVERLEAF_GIT_TOKEN`
- `OVERLEAF_EMAIL`
- `OVERLEAF_DISCOVERY_MODE` = `account` | `urls`
- `OVERLEAF_PROJECT_URLS` (comma-separated, used when mode=`urls`)

## Run Commands

### Full rebuild

```bash
npx tsx src/brain/run.ts full
```

Use for first run or periodic full refresh.

### Incremental improve run

```bash
npx tsx src/brain/run.ts incremental
```

Uses checkpoints and skips deep reprocessing where possible.

### Graph generation

```bash
npx tsx src/brain/visualize.ts
```

Optional custom graph output directory:
```bash
npx tsx src/brain/visualize.ts ./brain-store/my-graph
```

## Where to Find Everything

### Main knowledge output

- `brain-store/document/`  
  Project brain docs, persona/work-style docs, source hubs
- `brain-store/project/`
- `brain-store/repo/`
- `brain-store/post/`
- `brain-store/person/`

### Runtime metadata

- `brain-store/checkpoints/state.json` (last sync checkpoints)
- `brain-store/audit/runs.json` (run history and stats)
- audit includes `githubDocsSync` status for each run

### LinkedIn debug (browser mode)

- `brain-store/debug/`  
  Screenshots + parsed JSON traces for scrape troubleshooting

### Graph files

- `brain-store/graph/brain-graph-data.json`
- `brain-store/graph/brain-graph.html`

In graph UI, click a node to view:
- type/source/id
- source URL (if available)
- local brain file path

## Troubleshooting

- **LinkedIn profile lock error**
  - Close Chrome windows using same profile, or
  - switch to JSON mode (`LINKEDIN_INGESTION_MODE=json`).

- **Too many connector failures**
  - keep `BRAIN_CONTINUE_ON_CONNECTOR_ERROR=true` for partial success
  - inspect `brain-store/audit/runs.json`

- **Graph looks stale**
  - rerun build + visualize:
    - `npx tsx src/brain/run.ts incremental`
    - `npx tsx src/brain/visualize.ts`

- **OpenAI not being used**
  - check run logs for:
    - `model-friendly:openai:enabled model=...`
    - `model-friendly:openai:projectDocs progress=.../... generated=... fallback=...`
    - `model-friendly:openai:persona progress=.../... generated=... fallback=...`
    - `model-friendly:openai:projectDocs generated=... fallback=...`
    - `model-friendly:openai:persona generated=... fallback=...`
    - `model-friendly:openai:projectDocs failures=...`
    - `model-friendly:openai:persona failure=...`
  - if you see `openai:disabled`, verify `OPENAI_API_KEY` and `OPENAI_MODEL` are present in `.env`
  - inspect `brain-store/audit/runs.json` for `openaiGeneration` counters per run

## Security

- `.env` is ignored by git.
- Never share tokens in chat/logs/screenshots.
- Rotate keys immediately if exposed.

