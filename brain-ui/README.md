# Digital Brain React UI

## Run

1. `cd brain-ui`
2. `npm install`
3. `npm run dev`

The app reads graph data from `../brain-store/graph/brain-graph-data.json` through Vite `publicDir`.

## One Command From Root

Use the root workflow script to update data + regenerate graph + launch UI:

- `./scripts/run-brain-ui.sh incremental`
- `./scripts/run-brain-ui.sh full`

## Regenerate data

When your brain data changes, regenerate graph files from the root project, then refresh the UI.
