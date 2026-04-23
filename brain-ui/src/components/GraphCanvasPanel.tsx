import ForceGraph2D from "react-force-graph-2d";
import { useEffect, useRef } from "react";
import type { BrainGraphData, BrainLink, BrainNode } from "../types/graph";
import { colors } from "../theme/colors";

interface GraphCanvasPanelProps {
  data: BrainGraphData;
  visibleNodeIds: Set<string>;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  statsText: string;
}

const normalizeNodeId = (value: BrainLink["source"]): string =>
  typeof value === "string" ? value : value.id;

export const GraphCanvasPanel = ({
  data,
  visibleNodeIds,
  selectedNodeId,
  onSelectNode,
  statsText,
}: GraphCanvasPanelProps) => {
  const graphRef = useRef<any>(null);

  const filteredData: BrainGraphData = {
    nodes: data.nodes.filter((node) => visibleNodeIds.has(node.id)),
    links: data.links.filter((link) => {
      const sourceId = normalizeNodeId(link.source);
      const targetId = normalizeNodeId(link.target);
      return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
    }),
  };

  useEffect(() => {
    const linkForce = graphRef.current?.d3Force("link");
    if (linkForce) {
      linkForce.distance(120);
      linkForce.strength(0.85);
    }
    const chargeForce = graphRef.current?.d3Force("charge");
    if (chargeForce) {
      chargeForce.strength(-260);
    }
  }, [filteredData]);

  return (
    <main className="graph-pane">
      <div className="graph-overlay">{statsText}</div>
      <ForceGraph2D
        ref={graphRef}
        graphData={filteredData}
        backgroundColor={colors.background}
        nodeLabel={(node) => `${(node as BrainNode).label} [${(node as BrainNode).group}]`}
        nodeColor={(node) =>
          colors.graphNodeByGroup[(node as BrainNode).group] ?? colors.graphNodeFallback
        }
        linkColor={() => colors.graphLink}
        linkWidth={1.2}
        nodeRelSize={4}
        cooldownTicks={100}
        onNodeClick={(node) => onSelectNode((node as BrainNode).id)}
        nodeCanvasObject={(node, ctx, scale) => {
          const n = node as BrainNode;
          if (selectedNodeId === n.id) {
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, 6.25, 0, 2 * Math.PI);
            ctx.fillStyle = colors.accent;
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, 4, 0, 2 * Math.PI);
          ctx.fillStyle = colors.graphNodeByGroup[n.group] ?? colors.graphNodeFallback;
          ctx.fill();
          const fontSize = 10 / scale;
          ctx.font = `${fontSize}px Inter, sans-serif`;
          ctx.fillStyle = colors.textPrimary;
          ctx.fillText(n.label, (n.x ?? 0) + 8, (n.y ?? 0) + 3);
        }}
      />
    </main>
  );
};
