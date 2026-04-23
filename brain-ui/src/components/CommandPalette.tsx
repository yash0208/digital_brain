import type { BrainNode } from "../types/graph";

interface CommandPaletteProps {
  open: boolean;
  jumpPlaceholder: string;
  query: string;
  visibleNodes: BrainNode[];
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSelectNode: (nodeId: string) => void;
}

export const CommandPalette = ({
  open,
  jumpPlaceholder,
  query,
  visibleNodes,
  onClose,
  onQueryChange,
  onSelectNode,
}: CommandPaletteProps) => {
  if (!open) return null;
  const q = query.trim().toLowerCase();
  const matches = visibleNodes
    .filter((node) => !q || node.label.toLowerCase().includes(q) || node.id.includes(q))
    .slice(0, 30);

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette-card" onClick={(event) => event.stopPropagation()}>
        <input
          className="palette-input"
          placeholder={jumpPlaceholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          autoFocus
        />
        <div className="palette-results">
          {matches.map((node) => (
            <button
              key={node.id}
              className="palette-item"
              onClick={() => {
                onSelectNode(node.id);
                onClose();
              }}
            >
              {node.label} ({node.group})
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
