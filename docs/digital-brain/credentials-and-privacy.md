# Credentials and Privacy Controls

## Credential Mapping

- `GITHUB_TOKEN`: GitHub API access for repos, orgs, commits, and profile metadata.
- `GITHUB_USERNAME`: Primary account fallback for local-only metadata joins.
- `OPENAI_API_KEY`: Enables AI project understanding for project docs/README intelligence generation.
- `OPENAI_MODEL`: OpenAI model used for project analysis and documentation synthesis.
- `GITHUB_LOCAL_CLONE_ROOTS`: Comma-separated local roots where cloned GitHub repositories exist (used for deeper project understanding).
- `GITHUB_UPDATE_README`: When `true`, each discovered local repo README is created/updated with Digital Brain project intelligence.
- `BRAIN_CONTINUE_ON_CONNECTOR_ERROR`: When `true`, failed connectors are logged and skipped so the rebuild still completes with available sources.
- `LINKEDIN_PROFILE_URL`: Seed profile URL for browser extraction workflow.
- `LINKEDIN_INGESTION_MODE`: `browser` (default, Playwright scraping) or `json` (local JSON import mode).
- `LINKEDIN_BROWSER_USER_DATA_DIR`: Required in browser mode, points to your local Chrome user data dir so logged-in sessions can be reused.
- `LINKEDIN_BROWSER_HEADLESS`: `true` or `false` for LinkedIn browser scraping mode.
- `LINKEDIN_MAX_POSTS`: Max number of recent activity posts to capture per run.
- `LINKEDIN_DEBUG_DIR`: Optional folder where screenshots and parsed LinkedIn debug JSON are saved for each run.
- `LINKEDIN_PROFILE_JSON_PATH`: Optional local JSON file path for richer LinkedIn profile ingestion.
- `LINKEDIN_POSTS_JSON_PATH`: Optional local JSON array file path for LinkedIn posts ingestion.
- `OVERLEAF_GIT_TOKEN`: Overleaf Git authentication token for token-based project access.
- `OVERLEAF_EMAIL`: Overleaf account email used with token-based auth.
- `OVERLEAF_DISCOVERY_MODE`: `account` (default) to read from account-level discovery, `urls` for manual list mode.
- `OVERLEAF_PROJECT_URLS`: Optional comma-separated project URLs, used only when `OVERLEAF_DISCOVERY_MODE=urls`.

## Privacy Modes

- `full_raw`
  - Local Markdown stores normalized data + raw payload.
  - Notion stores normalized data + raw payload.
- `summaries_only`
  - Local Markdown stores normalized data only.
  - Notion stores normalized data only.
- `hybrid`
  - Local Markdown stores normalized data + raw payload.
  - Notion stores normalized data only.

## Safety Defaults

- Upsert-only writes by deterministic `externalId`.
- Checkpointed incremental sync to avoid repeated collection churn.
- JSON audit logs for each run (`mode`, timestamps, changed counts).

