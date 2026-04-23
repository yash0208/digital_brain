import { loadEnvFile } from "./core/load-env";
import { rebuildBrain } from "./orchestrator/rebuild-brain";

loadEnvFile();

const modeArg = process.argv[2];
const mode = modeArg === "full" ? "full" : "incremental";

rebuildBrain(mode)
  .then(() => {
    console.log(`Digital brain rebuild completed (${mode})`);
  })
  .catch((error: unknown) => {
    console.error("Digital brain rebuild failed", error);
    process.exit(1);
  });
