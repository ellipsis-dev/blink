import { step } from "./search.ts";

try {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new Error('Usage: ./blink "query" "directory"');
  const [query, directory] = args;
  console.log(JSON.stringify(await step({ query, directory }), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
