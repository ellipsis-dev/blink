import { step } from "./search.ts";
import { parseArgs } from "node:util";
import { walk } from "./walkers.ts";
import { relative } from "node:path";
import { formatJSON, formatTable, formatSummary } from "./output.ts";

export async function main(args = process.argv.slice(2)) {
  const started = performance.now();
  const { values, positionals } = parseArgs({
    args,
    options: {
      recursive: { type: "boolean", short: "r" },
      n_walkers: { type: "string", short: "n" },
      verbose: { type: "boolean", short: "v" },
    },
    allowPositionals: true,
  });
  if (positionals.length !== 2) throw new Error('Usage: ./blink [-r|--recursive] [-n|--n_walkers count] [-v|--verbose] "query" "directory"');
  const [query, directory] = positionals;
  const state = { query, directory };
  if (!values.recursive && values.n_walkers === undefined) {
    const result = await step(state, false, directory, values.verbose);
    console.log(formatSummary(performance.now() - started, result.usage ? 1 : 0, result.usage?.input_tokens ?? 0));
    console.log(formatJSON({ options: result.options }, directory));
    return;
  }
  const count = Number(values.n_walkers ?? "1");
  if (!/^\d+$/.test(values.n_walkers ?? "1") || !Number.isSafeInteger(count) || count < 1) {
    throw new Error("--n_walkers must be a positive integer.");
  }
  const result = await walk(state, count, values.verbose);
  console.log(formatSummary(performance.now() - started, result.queries, result.inputTokens));
  console.log(formatTable([
    ...result.files.map(({ file, posterior }) => ({ path: file, posterior })),
    ...result.unresolved.map(({ directory, posterior }) => ({ path: directory, posterior, unresolved: true })),
  ], directory));
  if (values.n_walkers === undefined && !result.files.length) {
    throw new Error(`No file found: ${relative(directory, result.unresolved[0].directory) || "."} has no searchable entries.`);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
