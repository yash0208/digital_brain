export interface OpenAIProjectContext {
  repoFullName: string;
  description?: string;
  topics: string[];
  languages: string[];
  readmeSnippet?: string;
  packageScripts: string[];
  architectureHint?: string;
}

export interface OpenAIMarkdownResult {
  ok: boolean;
  text?: string;
  status?: number;
  error?: string;
}

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const parseOutputText = (data: unknown): string | undefined => {
  if (!data || typeof data !== "object") return undefined;
  const payload = data as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  if (payload.output_text && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const chunks =
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((part) => part.type === "output_text" && typeof part.text === "string")
      .map((part) => part.text?.trim() ?? "")
      .filter(Boolean) ?? [];
  if (chunks.length) return chunks.join("\n\n");
  return undefined;
};

export const generateMarkdownWithOpenAIDetailed = async (
  apiKey: string,
  model: string,
  prompt: string
): Promise<OpenAIMarkdownResult> => {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: prompt,
        }),
      });

      const status = response.status;
      const bodyText = await response.text();
      if (!response.ok) {
        const isRetryable = status === 429 || status >= 500;
        if (isRetryable && attempt < maxAttempts) {
          await sleep(350 * attempt);
          continue;
        }
        return {
          ok: false,
          status,
          error: bodyText.slice(0, 600) || `HTTP ${status}`,
        };
      }

      let parsed: unknown = undefined;
      try {
        parsed = bodyText ? (JSON.parse(bodyText) as unknown) : undefined;
      } catch {
        return {
          ok: false,
          status,
          error: "OpenAI returned non-JSON response body",
        };
      }
      const outputText = parseOutputText(parsed);
      if (!outputText) {
        return {
          ok: false,
          status,
          error: "OpenAI response had no output text",
        };
      }
      return { ok: true, text: outputText, status };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown fetch error";
      if (attempt < maxAttempts) {
        await sleep(350 * attempt);
        continue;
      }
      return { ok: false, error: message };
    }
  }
  return { ok: false, error: "Unknown OpenAI execution state" };
};

export const generateMarkdownWithOpenAI = async (
  apiKey: string,
  model: string,
  prompt: string
): Promise<string | undefined> => {
  const result = await generateMarkdownWithOpenAIDetailed(apiKey, model, prompt);
  return result.text;
};

export const generateProjectIntelligenceWithOpenAI = async (
  apiKey: string,
  model: string,
  context: OpenAIProjectContext
): Promise<string | undefined> => {
  const prompt = [
    "Generate concise project intelligence markdown with sections:",
    "Use Case, What This Project Does, Architecture, Technology Stack, Data Structure, How To Run.",
    "Ground content only in provided context. If unknown, say 'Not clearly identified'.",
    "",
    `Repository: ${context.repoFullName}`,
    `Description: ${context.description ?? "N/A"}`,
    `Topics: ${context.topics.join(", ") || "N/A"}`,
    `Languages: ${context.languages.join(", ") || "N/A"}`,
    `Architecture hint: ${context.architectureHint ?? "N/A"}`,
    `Package scripts: ${context.packageScripts.join(", ") || "N/A"}`,
    "",
    "README snippet:",
    context.readmeSnippet ?? "N/A",
  ].join("\n");

  return generateMarkdownWithOpenAI(apiKey, model, prompt);
};
