import { useMemo, useState } from "react";
import type { BrainGraphData, BrainNode } from "../types/graph";

export const useBrainFilters = (data: BrainGraphData | null) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set());

  const groupCounts = useMemo(() => {
    if (!data) return new Map<string, number>();
    const counts = new Map<string, number>();
    data.nodes.forEach((node) => {
      counts.set(node.group, (counts.get(node.group) ?? 0) + 1);
    });
    return counts;
  }, [data]);

  const initializedGroups = useMemo(() => {
    if (activeGroups.size > 0 || groupCounts.size === 0) return activeGroups;
    return new Set(groupCounts.keys());
  }, [activeGroups, groupCounts]);

  const visibleNodes = useMemo(() => {
    if (!data) return [] as BrainNode[];
    const query = searchQuery.trim().toLowerCase();
    return data.nodes.filter((node) => {
      if (!initializedGroups.has(node.group)) return false;
      if (!query) return true;
      return (
        node.label.toLowerCase().includes(query) || node.id.toLowerCase().includes(query)
      );
    });
  }, [data, initializedGroups, searchQuery]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes]
  );

  const toggleGroup = (group: string) => {
    setActiveGroups((prev) => {
      const next = new Set(prev.size > 0 ? prev : groupCounts.keys());
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return {
    searchQuery,
    setSearchQuery,
    activeGroups: initializedGroups,
    groupCounts,
    visibleNodes,
    visibleNodeIds,
    toggleGroup,
  };
};
