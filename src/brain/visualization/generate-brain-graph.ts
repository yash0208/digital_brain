import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

interface GraphNode {
  id: string;
  label: string;
  group: string;
  source?: string;
  sourceUrl?: string;
  filePath?: string;
}

interface GraphLink {
  source: string;
  target: string;
  relation: string;
}

interface ParsedEntity {
  externalId: string;
  entityType: string;
  source?: string;
  sourceUrl?: string;
  filePath: string;
  bodyMap: Record<string, unknown>;
}

interface GenerateGraphOptions {
  storeDir: string;
  outputDir: string;
}

interface GenerateGraphResult {
  htmlPath: string;
  dataPath: string;
}

const RELATION_KEYS = new Set([
  "repoIds",
  "documentIds",
  "organizations",
  "evidenceIds",
  "projectIds",
]);

const walkMarkdown = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) return walkMarkdown(fullPath);
      if (entry.isFile() && entry.name.endsWith(".md")) return [fullPath];
      return [];
    })
  );
  return nested.flat();
};

const parseFrontmatter = (content: string): Record<string, string> => {
  const lines = content.split("\n");
  if (lines[0] !== "---") return {};
  const endIndex = lines.indexOf("---", 1);
  if (endIndex === -1) return {};
  const frontmatterLines = lines.slice(1, endIndex);
  const parsed: Record<string, string> = {};
  for (const line of frontmatterLines) {
    const [key, ...valueParts] = line.split(":");
    if (!key || valueParts.length === 0) continue;
    parsed[key.trim()] = valueParts.join(":").trim();
  }
  return parsed;
};

const parseScalar = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
};

const parseBodyMap = (content: string): Record<string, unknown> => {
  const lines = content.split("\n");
  const map: Record<string, unknown> = {};
  for (const line of lines) {
    if (!line.startsWith("- ")) continue;
    const markerIndex = line.indexOf(":");
    if (markerIndex === -1) continue;
    const key = line.slice(2, markerIndex).trim();
    const value = line.slice(markerIndex + 1).trim();
    map[key] = parseScalar(value);
  }
  return map;
};

const parseEntityFile = async (filePath: string): Promise<ParsedEntity | undefined> => {
  const content = await readFile(filePath, "utf8");
  const fm = parseFrontmatter(content);
  const externalId = fm.externalId;
  const entityType = fm.entityType ?? "unknown";
  if (!externalId) return undefined;
  return {
    externalId,
    entityType,
    source: fm.source,
    sourceUrl: fm.sourceUrl,
    filePath,
    bodyMap: parseBodyMap(content),
  };
};

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
    } catch {
      return [];
    }
  }
  return [];
};

const toTopicId = (value: string): string =>
  `topic:${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;

const dedupeLinks = (links: GraphLink[]): GraphLink[] => {
  const seen = new Set<string>();
  const out: GraphLink[] = [];
  for (const link of links) {
    const key = `${link.source}::${link.target}::${link.relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
};

const buildGraph = (entities: ParsedEntity[]): { nodes: GraphNode[]; links: GraphLink[] } => {
  const filteredEntities = entities.filter(
    (entity) => entity.entityType !== "commit_activity"
  );

  const nodes: GraphNode[] = filteredEntities.map((entity) => {
    const name = entity.bodyMap.name;
    const title = entity.bodyMap.title;
    const profile = entity.bodyMap.profileName;
    const label =
      (typeof name === "string" && name) ||
      (typeof title === "string" && title) ||
      (typeof profile === "string" && profile) ||
      entity.externalId;
    return {
      id: entity.externalId,
      label,
      group: entity.entityType,
      source: entity.source,
      sourceUrl: entity.sourceUrl,
      filePath: entity.filePath,
    };
  });

  const knownIds = new Set(nodes.map((node) => node.id));
  const links: GraphLink[] = [];

  for (const entity of filteredEntities) {
    for (const [key, value] of Object.entries(entity.bodyMap)) {
      if (!RELATION_KEYS.has(key)) continue;
      const targets = asStringArray(value);
      for (const target of targets) {
        if (!knownIds.has(target)) continue;
        links.push({
          source: entity.externalId,
          target,
          relation: key,
        });
      }
    }
  }

  // Add source hubs so models can reason top-down:
  // github -> repos/projects/docs, linkedin -> posts/persona docs, etc.
  const sourceGroups = new Map<string, string[]>();
  for (const entity of filteredEntities) {
    if (!entity.source) continue;
    const list = sourceGroups.get(entity.source) ?? [];
    list.push(entity.externalId);
    sourceGroups.set(entity.source, list);
  }

  for (const [source, entityIds] of sourceGroups.entries()) {
    const hubId = `hub:source:${source}`;
    nodes.push({
      id: hubId,
      label: `${source.toUpperCase()} Hub`,
      group: "hub_source",
      source,
      sourceUrl: undefined,
      filePath: undefined,
    });
    knownIds.add(hubId);
    for (const entityId of entityIds) {
      links.push({
        source: hubId,
        target: entityId,
        relation: "source_hub",
      });
    }
  }

  // Add topic/language hubs from repo metadata for easier persona/project understanding.
  const topicNodes = new Map<string, GraphNode>();
  for (const entity of filteredEntities) {
    if (entity.entityType !== "repo") continue;
    const topics = asStringArray(entity.bodyMap.topics);
    const languages = asStringArray(entity.bodyMap.languages);
    const allSignals = [...topics, ...languages].filter(Boolean).slice(0, 20);
    for (const signal of allSignals) {
      const topicId = toTopicId(signal);
      if (!topicId || topicId === "topic:") continue;
      if (!topicNodes.has(topicId)) {
        topicNodes.set(topicId, {
          id: topicId,
          label: signal,
          group: "hub_topic",
          source: "brain",
          sourceUrl: undefined,
          filePath: undefined,
        });
      }
      links.push({
        source: entity.externalId,
        target: topicId,
        relation: "has_topic",
      });
    }
  }

  for (const node of topicNodes.values()) {
    if (knownIds.has(node.id)) continue;
    nodes.push(node);
    knownIds.add(node.id);
  }

  // Interconnect projects to repos semantically if they share name tokens.
  const repos = filteredEntities.filter((entity) => entity.entityType === "repo");
  const projects = filteredEntities.filter((entity) => entity.entityType === "project");
  for (const project of projects) {
    const projectName = String(project.bodyMap.name ?? "").toLowerCase();
    if (!projectName) continue;
    for (const repo of repos) {
      const repoName = String(repo.bodyMap.name ?? "").toLowerCase();
      if (!repoName) continue;
      if (projectName === repoName || repoName.includes(projectName) || projectName.includes(repoName)) {
        links.push({
          source: project.externalId,
          target: repo.externalId,
          relation: "semantic_project_repo",
        });
      }
    }
  }

  return { nodes, links: dedupeLinks(links) };
};

const renderHtml = (title: string, graphDataJson: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin: 0; font-family: Inter, Arial, sans-serif; background: #0b1020; color: #dce3ff; }
      header { padding: 14px 18px; border-bottom: 1px solid #1e2746; display: flex; gap: 14px; align-items: center; }
      #legend { font-size: 13px; opacity: 0.9; }
      #layout { display: flex; width: 100vw; height: calc(100vh - 52px); }
      #graph { width: calc(100vw - 360px); height: calc(100vh - 52px); }
      #panel {
        width: 360px;
        border-left: 1px solid #1e2746;
        padding: 14px;
        overflow: auto;
        background: #0d1326;
      }
      #panel h3 { margin: 0 0 10px 0; font-size: 16px; }
      #panel .meta { margin: 6px 0; font-size: 13px; opacity: 0.95; }
      #panel a { color: #8bd3ff; text-decoration: none; word-break: break-all; }
      #panel a:hover { text-decoration: underline; }
      .node-label { font-size: 11px; fill: #dce3ff; pointer-events: none; }
      .link { stroke: #4c5f99; stroke-opacity: 0.5; }
      .clickable { cursor: pointer; }
    </style>
  </head>
  <body>
    <header>
      <strong>Digital Brain Graph</strong>
      <span id="legend">Drag nodes, zoom canvas, hover nodes for details.</span>
    </header>
    <div id="layout">
      <svg id="graph"></svg>
      <aside id="panel">
        <h3>Node Details</h3>
        <div class="meta">Click any node to view readable details.</div>
      </aside>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
    <script>
      const svg = d3.select("#graph");
      const width = window.innerWidth - 360;
      const height = window.innerHeight - 52;
      svg.attr("viewBox", [0, 0, width, height]);
      const g = svg.append("g");
      const panel = document.getElementById("panel");

      svg.call(d3.zoom().scaleExtent([0.2, 3]).on("zoom", (event) => g.attr("transform", event.transform)));

      const palette = d3.scaleOrdinal()
        .domain(["person","organization","project","repo","post","document","skill","automation_profile","hub_source","hub_topic","unknown"])
        .range(["#8bd3ff","#ffe28b","#9bffa0","#ffa4d2","#b8a6ff","#7ff3df","#ff9f80","#93a0ff","#ffd37f","#9afff1","#c4d0ff"]);

      const data = ${graphDataJson};
      (function renderGraph() {
          const simulation = d3.forceSimulation(data.nodes)
            .force("link", d3.forceLink(data.links).id((d) => d.id).distance(90))
            .force("charge", d3.forceManyBody().strength(-220))
            .force("center", d3.forceCenter(width / 2, height / 2));

          const link = g.append("g")
            .attr("stroke-width", 1.2)
            .selectAll("line")
            .data(data.links)
            .join("line")
            .attr("class", "link");

          const node = g.append("g")
            .selectAll("circle")
            .data(data.nodes)
            .join("circle")
            .attr("r", 7)
            .attr("fill", (d) => palette(d.group))
            .attr("class", "clickable")
            .append("title")
            .text((d) => d.label + " [" + d.group + "]" + (d.source ? " (" + d.source + ")" : ""));

          const nodeDrag = d3.drag()
            .on("start", (event, d) => {
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on("drag", (event, d) => {
              d.fx = event.x;
              d.fy = event.y;
            })
            .on("end", (event, d) => {
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            });

          const circles = g.selectAll("circle").call(nodeDrag);
          circles.on("click", (event, d) => {
            const sourceLink = d.sourceUrl
              ? '<div class="meta"><strong>Source URL:</strong><br/><a target="_blank" href="' + d.sourceUrl + '">' + d.sourceUrl + "</a></div>"
              : "";
            const fileLink = d.filePath
              ? '<div class="meta"><strong>Brain File:</strong><br/><a target="_blank" href="file://' + d.filePath + '">' + d.filePath + "</a></div>"
              : "";

            panel.innerHTML =
              "<h3>" + d.label + "</h3>" +
              '<div class="meta"><strong>Type:</strong> ' + d.group + "</div>" +
              '<div class="meta"><strong>Source:</strong> ' + (d.source || "unknown") + "</div>" +
              '<div class="meta"><strong>ID:</strong> ' + d.id + "</div>" +
              sourceLink +
              fileLink;
          });

          const labels = g.append("g")
            .selectAll("text")
            .data(data.nodes)
            .join("text")
            .attr("class", "node-label")
            .text((d) => d.label);

          simulation.on("tick", () => {
            link
              .attr("x1", (d) => d.source.x)
              .attr("y1", (d) => d.source.y)
              .attr("x2", (d) => d.target.x)
              .attr("y2", (d) => d.target.y);

            circles
              .attr("cx", (d) => d.x)
              .attr("cy", (d) => d.y);

            labels
              .attr("x", (d) => d.x + 9)
              .attr("y", (d) => d.y + 3);
          });
      })();
    </script>
  </body>
</html>
`;

export const generateBrainGraph = async (options: GenerateGraphOptions): Promise<GenerateGraphResult> => {
  const markdownFiles = await walkMarkdown(options.storeDir);
  const entities = (
    await Promise.all(markdownFiles.map((filePath) => parseEntityFile(filePath)))
  ).filter((entity): entity is ParsedEntity => Boolean(entity));

  const graph = buildGraph(entities);
  await mkdir(options.outputDir, { recursive: true });

  const dataPath = join(options.outputDir, "brain-graph-data.json");
  const htmlPath = join(options.outputDir, "brain-graph.html");

  const graphDataPretty = JSON.stringify(graph, null, 2);
  await writeFile(dataPath, `${graphDataPretty}\n`, "utf8");
  await writeFile(htmlPath, renderHtml("Digital Brain Graph", graphDataPretty), "utf8");

  return { htmlPath, dataPath };
};
