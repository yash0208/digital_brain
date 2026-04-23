import { useEffect, useMemo, useState } from "react";
import { BrainShell } from "./components/BrainShell";
import { CommandPalette } from "./components/CommandPalette";
import { GraphCanvasPanel } from "./components/GraphCanvasPanel";
import { LeftSidebar } from "./components/LeftSidebar";
import { MarkdownPreviewPanel } from "./components/MarkdownPreviewPanel";
import { NodeInspectorPanel } from "./components/NodeInspectorPanel";
import { TopBar } from "./components/TopBar";
import { useBrainData } from "./hooks/useBrainData";
import { useBrainFilters } from "./hooks/useBrainFilters";
import { useCommandPalette } from "./hooks/useCommandPalette";
import { getLocale, translate } from "./i18n/text";
import { applyThemeVariables } from "./theme/applyTheme";

export const App = () => {
  const locale = getLocale();
  const t = (key: string, values?: Record<string, string | number>) =>
    translate(key, values, locale);

  const { data, loading, error } = useBrainData();
  const {
    searchQuery,
    setSearchQuery,
    activeGroups,
    groupCounts,
    visibleNodes,
    visibleNodeIds,
    toggleGroup,
  } = useBrainFilters(data);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const { open, setOpen } = useCommandPalette();

  const selectedNode = useMemo(
    () => data?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [data, selectedNodeId]
  );

  useEffect(() => {
    applyThemeVariables();
  }, []);

  if (loading) return <div className="loading-state">{t("loadingGraph")}</div>;
  if (error || !data) return <div className="error-state">{error ?? t("loadingGraphFailed")}</div>;

  return (
    <>
      <BrainShell
        topBar={
          <TopBar
            title={t("appTitle")}
            subtitle={t("appSubtitle")}
            searchPlaceholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={setSearchQuery}
          />
        }
        leftSidebar={
          <LeftSidebar
            filtersTitle={t("filtersTitle")}
            nodesTitle={t("nodesTitle")}
            groupCounts={groupCounts}
            activeGroups={activeGroups}
            onToggleGroup={toggleGroup}
            visibleNodes={visibleNodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            unknownSource={t("unknownSource")}
          />
        }
        graphPanel={
          <GraphCanvasPanel
            data={data}
            visibleNodeIds={visibleNodeIds}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            statsText={t("visibleStats", {
              visible: visibleNodes.length,
              total: data.nodes.length,
              links: data.links.length,
            })}
          />
        }
        rightPanel={
          <>
            <NodeInspectorPanel
              title={t("inspectorTitle")}
              sourceLabel={t("sourceLabel")}
              typeLabel={t("typeLabel")}
              idLabel={t("idLabel")}
              fileLabel={t("fileLabel")}
              sourceUrlLabel={t("sourceUrlLabel")}
              unknownSource={t("unknownSource")}
              fileNone={t("fileNone")}
              selectedNode={selectedNode}
              selectNodeHint={t("selectNodeHint")}
            />
            <MarkdownPreviewPanel
              title={t("previewTitle")}
              emptyText={t("previewEmpty")}
              unavailableText={t("previewUnavailable")}
              selectedNode={selectedNode}
            />
          </>
        }
      />
      <CommandPalette
        open={open}
        jumpPlaceholder={t("jumpPlaceholder")}
        query={searchQuery}
        visibleNodes={visibleNodes}
        onClose={() => setOpen(false)}
        onQueryChange={setSearchQuery}
        onSelectNode={setSelectedNodeId}
      />
    </>
  );
};
