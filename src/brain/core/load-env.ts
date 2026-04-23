import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const parseLine = (line: string): { key: string; value: string } | undefined => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;

  const index = trimmed.indexOf("=");
  if (index <= 0) return undefined;

  const key = trimmed.slice(0, index).trim();
  const value = trimmed.slice(index + 1).trim();
  if (!key) return undefined;

  return { key, value };
};

export const loadEnvFile = (path = ".env"): void => {
  const absolutePath = resolve(process.cwd(), path);
  if (!existsSync(absolutePath)) return;

  const content = readFileSync(absolutePath, "utf8");
  const lines = content.split("\n");

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    if (process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
};
