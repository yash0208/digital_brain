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
      :root {
        --obs-bg: #141414;
        --obs-bg-alt: #1c1c1c;
        --obs-surface: #202020;
        --obs-border: #2e2e2e;
        --obs-text: #d4d4d4;
        --obs-text-muted: #9b9b9b;
        --obs-accent: #7ea7ff;
        --obs-shadow: 0 10px 24px rgba(0, 0, 0, 0.26);
        --radius: 12px;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        background: var(--obs-bg);
        color: var(--obs-text);
      }
      .app {
        display: grid;
        grid-template-columns: 300px minmax(480px, 1fr) 360px;
        grid-template-rows: 60px calc(100vh - 60px);
        width: 100vw;
        height: 100vh;
      }
      .topbar {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 16px;
        border-bottom: 1px solid var(--obs-border);
        background: linear-gradient(180deg, #1a1a1a 0%, #171717 100%);
      }
      .title { font-size: 16px; font-weight: 600; }
      .hint { color: var(--obs-text-muted); font-size: 12px; }
      .search {
        margin-left: auto;
        width: min(460px, 48%);
        border: 1px solid var(--obs-border);
        background: var(--obs-bg-alt);
        color: var(--obs-text);
        border-radius: 10px;
        padding: 10px 12px;
        outline: none;
      }
      .search:focus { border-color: var(--obs-accent); }
      .sidebar, .inspector {
        background: var(--obs-bg-alt);
        border-right: 1px solid var(--obs-border);
        overflow: auto;
      }
      .inspector { border-right: none; border-left: 1px solid var(--obs-border); }
      .pane { padding: 14px; }
      .section-title {
        margin: 0 0 10px 0;
        font-size: 12px;
        letter-spacing: 0.08em;
        color: var(--obs-text-muted);
        text-transform: uppercase;
      }
      .chip-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
      .chip {
        border: 1px solid var(--obs-border);
        background: var(--obs-surface);
        color: var(--obs-text);
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .chip.active {
        border-color: var(--obs-accent);
        color: #cddbff;
        background: rgba(126, 167, 255, 0.12);
      }
      .node-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: calc(100vh - 300px);
        overflow: auto;
      }
      .node-item {
        border: 1px solid var(--obs-border);
        border-radius: 10px;
        background: #242424;
        padding: 8px 10px;
        cursor: pointer;
      }
      .node-item:hover { border-color: #474747; }
      .node-item strong { display: block; font-size: 13px; }
      .node-item span { color: var(--obs-text-muted); font-size: 12px; }
      .graph-pane { position: relative; overflow: hidden; }
      #graph { width: 100%; height: 100%; display: block; }
      .graph-overlay {
        position: absolute;
        top: 14px;
        left: 14px;
        border: 1px solid var(--obs-border);
        background: rgba(30, 30, 30, 0.9);
        border-radius: 10px;
        padding: 8px 10px;
        box-shadow: var(--obs-shadow);
        font-size: 12px;
        color: var(--obs-text-muted);
      }
      .meta { margin: 8px 0; font-size: 13px; }
      .meta strong { color: #f2f2f2; }
      a { color: #93b6ff; text-decoration: none; word-break: break-all; }
      a:hover { text-decoration: underline; }
      .node-label { font-size: 10px; fill: #cfcfcf; pointer-events: none; }
      .link { stroke: #4b4b4b; stroke-opacity: 0.45; }
      .clickable { cursor: pointer; }
      #palette {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.44);
        display: none;
        align-items: flex-start;
        justify-content: center;
        padding-top: 84px;
      }
      #palette.open { display: flex; }
      .palette-card {
        width: min(680px, 92vw);
        border: 1px solid var(--obs-border);
        border-radius: var(--radius);
        background: #1c1c1c;
        box-shadow: var(--obs-shadow);
        overflow: hidden;
      }
      #palette-input {
        width: 100%;
        border: none;
        border-bottom: 1px solid var(--obs-border);
        background: #202020;
        color: var(--obs-text);
        padding: 14px;
        outline: none;
      }
      #palette-results { max-height: 300px; overflow: auto; }
      .palette-item {
        padding: 10px 14px;
        border-bottom: 1px solid #2a2a2a;
        cursor: pointer;
      }
      .palette-item:hover { background: #262626; }
    </style>
  </head>
  <body>
    <div class="app">
      <header class="topbar">
        <div class="title">Digital Brain Workspace</div>
        <div class="hint">Obsidian-style graph explorer</div>
        <input id="search" class="search" placeholder="Search nodes... (Ctrl/Cmd+K)" />
      </header>
      <aside class="sidebar">
        <div class="pane">
          <h2 class="section-title">Filters</h2>
          <div id="group-chips" class="chip-row"></div>
          <h2 class="section-title">Nodes</h2>
          <div id="node-list" class="node-list"></div>
        </div>
      </aside>
      <main class="graph-pane">
        <svg id="graph"></svg>
        <div class="graph-overlay" id="graph-stats"></div>
      </main>
      <aside class="inspector">
        <div class="pane">
          <h2 class="section-title">Node Inspector</h2>
          <div id="inspector"><div class="meta">Select a node from graph or list.</div></div>
          <h2 class="section-title">Markdown Preview</h2>
          <div id="markdown-preview" class="meta">Select a node with a file path.</div>
        </div>
      </aside>
    </div>
    <div id="palette" aria-hidden="true">
      <div class="palette-card">
        <input id="palette-input" placeholder="Jump to node..." />
        <div id="palette-results"></div>
      </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
    <script>
      const data = ${graphDataJson};
      const appState = { search: "", activeGroups: new Set(), selectedNodeId: null };
      const searchEl = document.getElementById("search");
      const chipsEl = document.getElementById("group-chips");
      const nodeListEl = document.getElementById("node-list");
      const inspectorEl = document.getElementById("inspector");
      const markdownEl = document.getElementById("markdown-preview");
      const statsEl = document.getElementById("graph-stats");
      const paletteEl = document.getElementById("palette");
      const paletteInputEl = document.getElementById("palette-input");
      const paletteResultsEl = document.getElementById("palette-results");

      const groupCounts = new Map();
      data.nodes.forEach((node) => {
        const existing = groupCounts.get(node.group) || 0;
        groupCounts.set(node.group, existing + 1);
      });
      const groups = [...groupCounts.entries()].sort((a, b) => b[1] - a[1]);
      groups.forEach(([group, count]) => {
        const button = document.createElement("button");
        button.className = "chip active";
        button.textContent = group + " (" + count + ")";
        appState.activeGroups.add(group);
        button.addEventListener("click", () => {
          if (appState.activeGroups.has(group)) {
            appState.activeGroups.delete(group);
            button.classList.remove("active");
          } else {
            appState.activeGroups.add(group);
            button.classList.add("active");
          }
          renderAll();
        });
        chipsEl.appendChild(button);
      });

      const palette = d3.scaleOrdinal()
        .domain(["person", "organization", "project", "repo", "post", "document", "skill", "automation_profile", "hub_source", "hub_topic", "unknown"])
        .range(["#7ea7ff", "#ffcc66", "#89d185", "#cb96ff", "#f29fc1", "#84d8c9", "#ffaa77", "#8fa8ff", "#e7c470", "#76d7d1", "#b5b5b5"]);

      const svg = d3.select("#graph");
      const graphPaneWidth = () => document.querySelector(".graph-pane").clientWidth;
      const graphPaneHeight = () => document.querySelector(".graph-pane").clientHeight;
      const g = svg.append("g");
      svg.call(d3.zoom().scaleExtent([0.2, 4]).on("zoom", (event) => g.attr("transform", event.transform)));
      const simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id((d) => d.id).distance(85))
        .force("charge", d3.forceManyBody().strength(-180))
        .force("center", d3.forceCenter(graphPaneWidth() / 2, graphPaneHeight() / 2));
      const links = g.append("g").attr("stroke-width", 1.2).selectAll("line").data(data.links).join("line").attr("class", "link");
      const circles = g.append("g").selectAll("circle").data(data.nodes).join("circle").attr("r", 6.5).attr("fill", (d) => palette(d.group)).attr("class", "clickable");
      circles.append("title").text((d) => d.label + " [" + d.group + "]");
      const labels = g.append("g").selectAll("text").data(data.nodes).join("text").attr("class", "node-label").text((d) => d.label);

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

      circles.call(nodeDrag).on("click", (_event, d) => {
        appState.selectedNodeId = d.id;
        renderAll();
      });

      simulation.on("tick", () => {
        links
          .attr("x1", (d) => d.source.x)
          .attr("y1", (d) => d.source.y)
          .attr("x2", (d) => d.target.x)
          .attr("y2", (d) => d.target.y);
        circles.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
        labels.attr("x", (d) => d.x + 9).attr("y", (d) => d.y + 3);
      });

      const matchesFilters = (node) => {
        const query = appState.search.trim().toLowerCase();
        if (!appState.activeGroups.has(node.group)) return false;
        if (!query) return true;
        return node.label.toLowerCase().includes(query) || node.id.toLowerCase().includes(query);
      };
      const getVisibleNodes = () => data.nodes.filter(matchesFilters);
      const getVisibleNodeIds = () => new Set(getVisibleNodes().map((node) => node.id));

      const renderNodeList = (visibleNodes) => {
        nodeListEl.innerHTML = "";
        visibleNodes.slice(0, 200).forEach((node) => {
          const item = document.createElement("button");
          item.className = "node-item";
          item.innerHTML = "<strong>" + node.label + "</strong><span>" + node.group + " • " + (node.source || "unknown") + "</span>";
          item.addEventListener("click", () => {
            appState.selectedNodeId = node.id;
            renderAll();
          });
          nodeListEl.appendChild(item);
        });
      };

      const escapeHtml = (value) =>
        String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

      const renderInspector = (selectedNode) => {
        if (!selectedNode) {
          inspectorEl.innerHTML = '<div class="meta">Select a node from graph or list.</div>';
          markdownEl.textContent = "Select a node with a file path.";
          return;
        }
        const sourceLink = selectedNode.sourceUrl
          ? '<div class="meta"><strong>Source URL:</strong><br/><a target="_blank" href="' + selectedNode.sourceUrl + '">' + selectedNode.sourceUrl + "</a></div>"
          : "";
        const fileLink = selectedNode.filePath
          ? '<div class="meta"><strong>File:</strong><br/><a target="_blank" href="file://' + selectedNode.filePath + '">' + selectedNode.filePath + "</a></div>'
          : '<div class="meta"><strong>File:</strong> none</div>';
        inspectorEl.innerHTML =
          "<div class='meta'><strong>" + escapeHtml(selectedNode.label) + "</strong></div>" +
          "<div class='meta'><strong>Type:</strong> " + escapeHtml(selectedNode.group) + "</div>" +
          "<div class='meta'><strong>Source:</strong> " + escapeHtml(selectedNode.source || "unknown") + "</div>" +
          "<div class='meta'><strong>ID:</strong> " + escapeHtml(selectedNode.id) + "</div>" +
          sourceLink +
          fileLink;
        if (!selectedNode.filePath) {
          markdownEl.textContent = "No markdown file linked to this node.";
          return;
        }
        const filePath = selectedNode.filePath.startsWith("./")
          ? selectedNode.filePath.slice(2)
          : selectedNode.filePath;
        const fetchPath = filePath.startsWith("brain-store/") ? "../../" + filePath : filePath;
        fetch(fetchPath)
          .then((resp) => (resp.ok ? resp.text() : Promise.reject(new Error("preview not available"))))
          .then((content) => {
            const lines = content.split("\\n").slice(0, 28).join("\\n");
            markdownEl.innerHTML = "<pre style='white-space:pre-wrap; font-size:12px; margin:0; color:#c8c8c8;'>" + escapeHtml(lines) + "</pre>";
          })
          .catch(() => {
            markdownEl.innerHTML = "Preview unavailable in this browser context. Open file link above.";
          });
      };

      const renderGraphVisibility = (visibleNodeIds) => {
        circles.style("display", (d) => (visibleNodeIds.has(d.id) ? null : "none"));
        labels.style("display", (d) => (visibleNodeIds.has(d.id) ? null : "none"));
        links.style("display", (d) => {
          const sourceId = typeof d.source === "string" ? d.source : d.source.id;
          const targetId = typeof d.target === "string" ? d.target : d.target.id;
          return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId) ? null : "none";
        });
      };

      const renderPaletteResults = (visibleNodes) => {
        const query = paletteInputEl.value.trim().toLowerCase();
        const candidates = visibleNodes
          .filter((node) => !query || node.label.toLowerCase().includes(query) || node.id.toLowerCase().includes(query))
          .slice(0, 25);
        paletteResultsEl.innerHTML = "";
        candidates.forEach((node) => {
          const item = document.createElement("div");
          item.className = "palette-item";
          item.textContent = node.label + " (" + node.group + ")";
          item.addEventListener("click", () => {
            appState.selectedNodeId = node.id;
            closePalette();
            renderAll();
          });
          paletteResultsEl.appendChild(item);
        });
      };

      const renderStats = (visibleNodes) => {
        statsEl.textContent = "Visible nodes: " + visibleNodes.length + " / " + data.nodes.length + " | Links: " + data.links.length;
      };

      const renderAll = () => {
        const visibleNodes = getVisibleNodes();
        const visibleNodeIds = getVisibleNodeIds();
        renderNodeList(visibleNodes);
        renderGraphVisibility(visibleNodeIds);
        renderPaletteResults(visibleNodes);
        renderStats(visibleNodes);
        const selectedNode = data.nodes.find((node) => node.id === appState.selectedNodeId);
        renderInspector(selectedNode);
      };

      const openPalette = () => {
        paletteEl.classList.add("open");
        paletteEl.setAttribute("aria-hidden", "false");
        paletteInputEl.value = appState.search;
        renderAll();
        setTimeout(() => paletteInputEl.focus(), 0);
      };
      const closePalette = () => {
        paletteEl.classList.remove("open");
        paletteEl.setAttribute("aria-hidden", "true");
      };

      searchEl.addEventListener("input", (event) => {
        appState.search = event.target.value;
        renderAll();
      });
      paletteInputEl.addEventListener("input", () => {
        appState.search = paletteInputEl.value;
        searchEl.value = appState.search;
        renderAll();
      });
      document.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          openPalette();
          return;
        }
        if (event.key === "Escape" && paletteEl.classList.contains("open")) closePalette();
      });
      paletteEl.addEventListener("click", (event) => {
        if (event.target === paletteEl) closePalette();
      });
      window.addEventListener("resize", () => {
        simulation.force("center", d3.forceCenter(graphPaneWidth() / 2, graphPaneHeight() / 2));
        simulation.alpha(0.2).restart();
      });

      renderAll();
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
