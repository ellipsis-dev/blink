import { step } from "./search.ts";
import { parseArgs } from "node:util";

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args,
    options: { recursive: { type: "boolean", short: "r" } },
    allowPositionals: true,
  });
  if (positionals.length !== 2) throw new Error('Usage: ./blink [-r|--recursive] "query" "directory"');
  const [query, directory] = positionals;
  const state = { query, directory };
  while (true) {
    const result = await step(state, values.recursive);
    console.log(JSON.stringify(result, null, 2));
    if (!values.recursive) break;
    const next = result.options[0];
    if (!next) throw new Error(`No file found: ${state.directory} has no searchable entries.`);
    if ("file" in next) {
      console.log(JSON.stringify({ file: next.file }, null, 2));
      break;
    }
    state.directory = next.directory;
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
