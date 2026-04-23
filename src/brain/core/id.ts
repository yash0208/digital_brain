import { createHash } from "crypto";

const normalizeParts = (parts: Array<string | undefined>): string =>
  parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => part.trim().toLowerCase())
    .join("|");

export const stableHash = (...parts: Array<string | undefined>): string => {
  const input = normalizeParts(parts);
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
};

export const makeEntityId = (
  prefix:
    | "person"
    | "organization"
    | "project"
    | "repo"
    | "commit"
    | "post"
    | "document"
    | "skill"
    | "automation",
  ...parts: Array<string | undefined>
): string => `${prefix}:${stableHash(...parts)}`;
