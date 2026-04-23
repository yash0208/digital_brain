export interface BrainNode {
  id: string;
  label: string;
  group: string;
  source?: string;
  sourceUrl?: string;
  filePath?: string;
}

export interface BrainLink {
  source: string | BrainNode;
  target: string | BrainNode;
  relation: string;
}

export interface BrainGraphData {
  nodes: BrainNode[];
  links: BrainLink[];
}
