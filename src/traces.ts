import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import settings from "../settings.json";
import { INPUT_USD_PER_MILLION } from "./output.ts";
import type { State } from "./search.ts";

export const OUTPUT_DIRECTORY = resolve(import.meta.dir, "..", "output");
const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

export type WalkerTrace = {
  id: string;
  search_id: string;
  walker_id: string;
  status: "running" | "completed" | "unresolved" | "failed";
  steps: { node: string; selected: string; probability: number }[];
  result: string | null;
  error?: string;
};

type Decision = {
  node: string;
  duration_ms?: number;
  model?: string;
  confidence?: number;
  usage?: { input_tokens: number; output_tokens: number };
  options: { node: string; type: string; probability: number; walkers: number }[];
};

async function writeJSON(path: string, value: unknown) {
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2) + "\n");
  await rename(`${path}.tmp`, path);
}

export async function createSearch(state: State, count: number, outputDirectory = join(OUTPUT_DIRECTORY, "searches")) {
  const started = performance.now();
  const searchId = id("search");
  const directory = join(outputDirectory, searchId);
  await mkdir(join(directory, "traces"), { recursive: true });
  const traces: WalkerTrace[] = Array.from({ length: count }, () => ({
    id: id("trace"), search_id: searchId, walker_id: id("walker"),
    status: "running", steps: [], result: null,
  }));
  const metadata = {
    id: searchId,
    query: state.query,
    root: resolve(state.directory),
    model: "jev-latest",
    n_walkers: count,
    status: "running" as "running" | "completed" | "failed",
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    finished_at: null as string | null,
    duration_ms: 0,
    api_queries: 0,
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_usd: 0,
    pricing: { input_usd_per_million: INPUT_USD_PER_MILLION, output_usd_per_million: 0 },
    settings: structuredClone(settings),
    walkers: traces.map(({ walker_id, id }) => ({ walker_id, trace: `traces/${id}.json` })),
    decisions: [] as Decision[],
    results: [] as { node: string; status: string; walkers: number; posterior: number }[],
    error: null as string | null,
    current_node: "." as string | null,
  };

  async function checkpoint(updated: WalkerTrace[] = []) {
    for (const trace of updated) await writeJSON(join(directory, "traces", `${trace.id}.json`), trace);
    metadata.updated_at = new Date().toISOString();
    metadata.duration_ms = performance.now() - started;
    metadata.estimated_cost_usd = metadata.input_tokens * INPUT_USD_PER_MILLION / 1_000_000;
    const results = new Map<string, { node: string; status: string; walkers: number; posterior: number }>();
    for (const trace of traces) {
      if (trace.result === null) continue;
      const key = `${trace.status}:${trace.result}`;
      const result = results.get(key) ?? { node: trace.result, status: trace.status, walkers: 0, posterior: 0 };
      result.walkers++;
      result.posterior = result.walkers / count;
      results.set(key, result);
    }
    metadata.results = [...results.values()].sort((a, b) => b.posterior - a.posterior || a.node.localeCompare(b.node));
    await writeJSON(join(directory, "metadata.json"), metadata);
  }

  async function finish(error?: unknown) {
    const failed = error !== undefined;
    metadata.status = failed ? "failed" : "completed";
    metadata.finished_at = new Date().toISOString();
    if (!failed) metadata.current_node = null;
    if (failed) metadata.error = error instanceof Error ? error.message : String(error);
    const unfinished = failed ? traces.filter((trace) => trace.status === "running") : [];
    for (const trace of unfinished) {
      trace.status = "failed";
      trace.error = metadata.error!;
    }
    await checkpoint(unfinished);
  }

  await writeJSON(join(directory, "metadata.json"), metadata);
  await checkpoint(traces);
  return { directory, metadata, traces, checkpoint, finish, relative: (path: string) => relative(metadata.root, path) || "." };
}
