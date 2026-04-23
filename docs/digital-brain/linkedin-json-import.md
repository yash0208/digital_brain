# LinkedIn JSON Import

Use this flow when browser scraping is blocked or unstable.

## Template Files

- `data/templates/linkedin-profile.template.json`
- `data/templates/linkedin-posts.template.json`

Copy and rename them (example):

- `data/linkedin-profile.json`
- `data/linkedin-posts.json`

## .env Settings

Set:

- `LINKEDIN_INGESTION_MODE=json`
- `LINKEDIN_PROFILE_JSON_PATH=/Users/yashmehta/Yash Digital Brain/data/linkedin-profile.json`
- `LINKEDIN_POSTS_JSON_PATH=/Users/yashmehta/Yash Digital Brain/data/linkedin-posts.json`

## Run

```bash
npx tsx src/brain/run.ts full
```

The connector will ingest LinkedIn person + posts from these files.
