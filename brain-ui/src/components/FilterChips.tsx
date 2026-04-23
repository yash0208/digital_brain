import type { ReactNode } from "react";

interface FilterChipsProps {
  groupCounts: Map<string, number>;
  activeGroups: Set<string>;
  onToggle: (group: string) => void;
}

export const FilterChips = ({ groupCounts, activeGroups, onToggle }: FilterChipsProps) => {
  const sortedGroups = [...groupCounts.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <div className="chip-row">
      {sortedGroups.map(([group, count]) => {
        const active = activeGroups.has(group);
        return (
          <button
            key={group}
            className={`chip ${active ? "active" : ""}`}
            onClick={() => onToggle(group)}
          >
            {group} ({count})
          </button>
        );
      })}
    </div>
  );
};

export const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h2 className="section-title">{children}</h2>
);
