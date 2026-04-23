import type { BrainNode } from "../types/graph";
import { FilterChips, SectionTitle } from "./FilterChips";

interface LeftSidebarProps {
  filtersTitle: string;
  nodesTitle: string;
  groupCounts: Map<string, number>;
  activeGroups: Set<string>;
  onToggleGroup: (group: string) => void;
  visibleNodes: BrainNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  unknownSource: string;
}

export const LeftSidebar = ({
  filtersTitle,
  nodesTitle,
  groupCounts,
  activeGroups,
  onToggleGroup,
  visibleNodes,
  selectedNodeId,
  onSelectNode,
  unknownSource,
}: LeftSidebarProps) => (
  <aside className="sidebar">
    <div className="pane">
      <SectionTitle>{filtersTitle}</SectionTitle>
      <FilterChips
        groupCounts={groupCounts}
        activeGroups={activeGroups}
        onToggle={onToggleGroup}
      />
      <SectionTitle>{nodesTitle}</SectionTitle>
      <div className="node-list">
        {visibleNodes.slice(0, 250).map((node) => (
          <button
            key={node.id}
            className={`node-item ${selectedNodeId === node.id ? "selected" : ""}`}
            onClick={() => onSelectNode(node.id)}
          >
            <strong>{node.label}</strong>
            <span>
              {node.group} • {node.source ?? unknownSource}
            </span>
          </button>
        ))}
      </div>
    </div>
  </aside>
);
