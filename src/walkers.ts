import { step, type State } from "./search.ts";
import { basename, resolve } from "node:path";
import { formatJSON } from "./output.ts";
import { createSearch } from "./traces.ts";

export function splitWalkers(count: number, probabilities: number[]): number[] {
  const total = probabilities.reduce((sum, probability) => sum + probability, 0);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("Walker count must be a positive integer.");
  if (!Number.isFinite(total) || total <= 0
    || probabilities.some((probability) => !Number.isFinite(probability) || probability < 0 || probability > 1)) {
    throw new Error("Jev returned invalid probabilities.");
  }
  const shares = probabilities.map((probability) => count * (probability / total));
  const counts = shares.map(Math.floor);
  const order = shares.map((share, index) => ({ index, remainder: share - counts[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remaining = count - counts.reduce((sum, allocated) => sum + allocated, 0);
  for (let index = 0; index < remaining; index++) counts[order[index].index]++;
  return counts;
}

export async function walk(state: State, nWalkers: number, verbose = false, outputDirectory?: string) {
  if (!Number.isSafeInteger(nWalkers) || nWalkers < 1) throw new Error("Walker count must be a positive integer.");
  const search = await createSearch(state, nWalkers, outputDirectory);
  const pending = [{ ...state, directory: resolve(state.directory), walkers: nWalkers, traces: search.traces }];
  const files: { file: string; walkers: number; posterior: number }[] = [];
  const unresolved: { directory: string; walkers: number; posterior: number }[] = [];
  let queries = 0;
  let inputTokens = 0;

  try {
    for (let index = 0; index < pending.length; index++) {
      const current = pending[index];
      search.metadata.current_node = search.relative(current.directory);
      await search.checkpoint();
      const { options, usage, evaluation } = await step(current, true, state.directory, verbose);
      if (usage) {
        queries++;
        inputTokens += usage.input_tokens;
        search.metadata.api_queries = queries;
        search.metadata.input_tokens = inputTokens;
        search.metadata.output_tokens += usage.output_tokens;
      }
      const counts = options.length ? splitWalkers(current.walkers, options.map((option) => option.probability)) : [];
      search.metadata.decisions.push({
        node: search.relative(current.directory), ...evaluation, usage,
        options: options.map((option, index) => ({
          node: search.relative("file" in option ? option.file : option.directory),
          type: "file" in option ? "file" : "directory", probability: option.probability, walkers: counts[index],
        })),
      });
      if (!options.length) {
        unresolved.push({ directory: current.directory, walkers: current.walkers, posterior: current.walkers / nWalkers });
        for (const trace of current.traces) {
          trace.status = "unresolved";
          trace.result = search.relative(current.directory);
        }
        await search.checkpoint(current.traces);
        continue;
      }
      if (verbose) console.log(formatJSON({
        directory: current.directory,
        walkers: current.walkers,
        options: options.map((option, index) => ({ ...option, walkers: counts[index] })),
      }, state.directory));
      let offset = 0;
      for (const [index, option] of options.entries()) {
        const walkers = counts[index];
        if (!walkers) continue;
        const traces = current.traces.slice(offset, offset + walkers);
        offset += walkers;
        const path = "file" in option ? option.file : option.directory;
        for (const trace of traces) {
          trace.steps.push({ node: search.relative(current.directory), selected: basename(path), probability: option.probability });
          if ("file" in option) {
            trace.status = "completed";
            trace.result = search.relative(path);
          }
        }
        if ("file" in option) files.push({ file: option.file, walkers, posterior: walkers / nWalkers });
        else pending.push({ query: state.query, directory: option.directory, walkers, traces });
      }
      await search.checkpoint(current.traces);
    }
    await search.finish();
  } catch (error) {
    await search.finish(error);
    throw error;
  }

  return {
    n_walkers: nWalkers,
    queries,
    inputTokens,
    search_directory: search.directory,
    files: files.sort((a, b) => b.posterior - a.posterior || a.file.localeCompare(b.file)),
    unresolved,
  };
}
