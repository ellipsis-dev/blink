import { step, type State } from "./search.ts";
import { resolve } from "node:path";
import { formatJSON } from "./output.ts";

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

export async function walk(state: State, nWalkers: number, verbose = false) {
  if (!Number.isSafeInteger(nWalkers) || nWalkers < 1) throw new Error("Walker count must be a positive integer.");
  const pending = [{ ...state, directory: resolve(state.directory), walkers: nWalkers }];
  const files: { file: string; walkers: number; posterior: number }[] = [];
  const unresolved: { directory: string; walkers: number; posterior: number }[] = [];
  let queries = 0;
  let inputTokens = 0;

  for (let index = 0; index < pending.length; index++) {
    const current = pending[index];
    const { options, usage } = await step(current, true, state.directory, verbose);
    if (usage) {
      queries++;
      inputTokens += usage.input_tokens;
    }
    if (!options.length) {
      unresolved.push({ directory: current.directory, walkers: current.walkers, posterior: current.walkers / nWalkers });
      continue;
    }
    const counts = splitWalkers(current.walkers, options.map((option) => option.probability));
    if (verbose) console.log(formatJSON({
      directory: current.directory,
      walkers: current.walkers,
      options: options.map((option, index) => ({ ...option, walkers: counts[index] })),
    }, state.directory));
    for (const [index, option] of options.entries()) {
      const walkers = counts[index];
      if (!walkers) continue;
      if ("file" in option) files.push({ file: option.file, walkers, posterior: walkers / nWalkers });
      else pending.push({ query: state.query, directory: option.directory, walkers });
    }
  }

  return {
    n_walkers: nWalkers,
    queries,
    inputTokens,
    files: files.sort((a, b) => b.posterior - a.posterior || a.file.localeCompare(b.file)),
    unresolved,
  };
}
