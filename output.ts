import { isAbsolute, relative, resolve } from "node:path";

export function formatSummary(elapsedMs: number, queries: number, inputTokens: number): string {
  // Jev pricing, September 16, 2026: $0.042 / million input tokens; output is free.
  // https://typesafe.ai/blog/introducing-system-one-models-and-jev
  const cost = inputTokens * 0.042 / 1_000_000;
  return `Duration: ${(elapsedMs / 1000).toFixed(2)}s\nAPI queries: ${queries}\nEst. cost: $${cost.toFixed(8)}\n`;
}

export function formatJSON(value: unknown, root: string): string {
  return JSON.stringify(value, (key, value) =>
    (key === "directory" || key === "file") && typeof value === "string" && isAbsolute(value)
      ? relative(resolve(root), value) || "."
      : value, 2);
}

export function formatTable(rows: { path: string; posterior: number; unresolved?: boolean }[], root: string): string {
  const ranked = [...rows].sort((a, b) => b.posterior - a.posterior || a.path.localeCompare(b.path));
  const entries = ranked.slice(0, 10)
    .map(({ path, posterior, unresolved }) => ({
      node: `${relative(resolve(root), path) || "."}${unresolved ? "/ (unresolved)" : ""}`,
      percent: `${(posterior * 100).toFixed(1)}%`,
    }));
  if (ranked.length > 10) {
    const other = ranked.slice(10).reduce((sum, row) => sum + row.posterior, 0);
    entries.push({ node: "OTHER", percent: `${(other * 100).toFixed(1)}%` });
  }
  const width = Math.max(4, ...entries.map(({ node }) => node.length));
  const border = (left: string, middle: string, right: string) =>
    `${left}${"─".repeat(width + 2)}${middle}${"─".repeat(8)}${right}`;
  return [
    border("┌", "┬", "┐"),
    ...[{ node: "Node", percent: "%" }, ...entries].flatMap(({ node, percent }, index) => [
      `│ ${node.padEnd(width)} │ ${percent.padStart(6)} │`,
      index === entries.length ? border("└", "┴", "┘") : border("├", "┼", "┤"),
    ]),
  ].join("\n");
}
