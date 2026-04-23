import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { BrainNode } from "../types/graph";
import { SectionTitle } from "./FilterChips";

interface MarkdownPreviewPanelProps {
  title: string;
  emptyText: string;
  unavailableText: string;
  selectedNode: BrainNode | null;
}

export const MarkdownPreviewPanel = ({
  title,
  emptyText,
  unavailableText,
  selectedNode,
}: MarkdownPreviewPanelProps) => {
  const [content, setContent] = useState<string>(emptyText);
  const [error, setError] = useState(false);

  useEffect(() => {
    const loadContent = async () => {
      if (!selectedNode?.filePath) {
        setError(false);
        setContent(emptyText);
        return;
      }
      try {
        setError(false);
        const normalizedPath = selectedNode.filePath.replace(/^\.\//, "");
        const fetchPath = normalizedPath.startsWith("brain-store/")
          ? `/../${normalizedPath}`
          : normalizedPath;
        const response = await fetch(fetchPath);
        if (!response.ok) throw new Error("Preview unavailable");
        const text = await response.text();
        setContent(text.split("\n").slice(0, 60).join("\n"));
      } catch {
        setError(true);
      }
    };
    void loadContent();
  }, [selectedNode, emptyText]);

  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      {error ? (
        <div className="meta">{unavailableText}</div>
      ) : (
        <div className="markdown-container">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
};
