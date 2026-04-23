import { loadEnvFile } from "./core/load-env";
import { generateBrainGraph } from "./visualization/generate-brain-graph";

loadEnvFile();

const storeDir = process.env.BRAIN_MARKDOWN_STORE_DIR ?? "./brain-store";
const outputDir = process.argv[2] ?? `${storeDir}/graph`;

generateBrainGraph({
  storeDir,
  outputDir,
})
  .then((result) => {
    console.log(`Graph HTML: ${result.htmlPath}`);
    console.log(`Graph data: ${result.dataPath}`);
  })
  .catch((error: unknown) => {
    console.error("Graph generation failed", error);
    process.exit(1);
  });
