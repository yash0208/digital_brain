import type { BrainNode } from "../types/graph";
import { SectionTitle } from "./FilterChips";

interface NodeInspectorPanelProps {
  title: string;
  sourceLabel: string;
  typeLabel: string;
  idLabel: string;
  fileLabel: string;
  sourceUrlLabel: string;
  unknownSource: string;
  fileNone: string;
  selectedNode: BrainNode | null;
  selectNodeHint: string;
}

export const NodeInspectorPanel = ({
  title,
  sourceLabel,
  typeLabel,
  idLabel,
  fileLabel,
  sourceUrlLabel,
  unknownSource,
  fileNone,
  selectedNode,
  selectNodeHint,
}: NodeInspectorPanelProps) => (
  <div>
    <SectionTitle>{title}</SectionTitle>
    {!selectedNode ? (
      <div className="meta">{selectNodeHint}</div>
    ) : (
      <>
        <div className="meta">
          <strong>{selectedNode.label}</strong>
        </div>
        <div className="meta">
          <strong>{typeLabel}:</strong> {selectedNode.group}
        </div>
        <div className="meta">
          <strong>{sourceLabel}:</strong> {selectedNode.source ?? unknownSource}
        </div>
        <div className="meta">
          <strong>{idLabel}:</strong> {selectedNode.id}
        </div>
        <div className="meta">
          <strong>{fileLabel}:</strong>{" "}
          {selectedNode.filePath ? (
            <a href={`file://${selectedNode.filePath}`} target="_blank" rel="noreferrer">
              {selectedNode.filePath}
            </a>
          ) : (
            fileNone
          )}
        </div>
        {selectedNode.sourceUrl ? (
          <div className="meta">
            <strong>{sourceUrlLabel}:</strong>{" "}
            <a href={selectedNode.sourceUrl} target="_blank" rel="noreferrer">
              {selectedNode.sourceUrl}
            </a>
          </div>
        ) : null}
      </>
    )}
  </div>
);
