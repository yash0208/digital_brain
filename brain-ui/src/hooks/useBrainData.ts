import { useEffect, useState } from "react";
import type { BrainGraphData } from "../types/graph";

interface UseBrainDataState {
  data: BrainGraphData | null;
  loading: boolean;
  error: string | null;
}

const GRAPH_URL = "/brain-graph-data.json";

export const useBrainData = (): UseBrainDataState => {
  const [data, setData] = useState<BrainGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(GRAPH_URL);
        if (!response.ok) {
          throw new Error(`Failed to load graph data from ${GRAPH_URL}`);
        }
        const parsed = (await response.json()) as BrainGraphData;
        setData(parsed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown graph loading error");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return { data, loading, error };
};
