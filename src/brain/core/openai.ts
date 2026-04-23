export interface OpenAIProjectContext {
  repoFullName: string;
  description?: string;
  topics: string[];
  languages: string[];
  readmeSnippet?: string;
  packageScripts: string[];
  architectureHint?: string;
}

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

  if (!response.ok) return undefined;
  const data = (await response.json()) as { output_text?: string };
  return data.output_text?.trim() || undefined;
};
