import { isAbsolute, relative, resolve } from "node:path";

export function formatJSON(value: unknown, root: string): string {
  return JSON.stringify(value, (key, value) =>
    (key === "directory" || key === "file") && typeof value === "string" && isAbsolute(value)
      ? relative(resolve(root), value) || "."
      : value, 2);
}

export function formatTable(rows: { path: string; posterior: number; unresolved?: boolean }[], root: string): string {
  const entries = rows
    .sort((a, b) => b.posterior - a.posterior || a.path.localeCompare(b.path))
    .map(({ path, posterior, unresolved }) => ({
      node: `${relative(resolve(root), path) || "."}${unresolved ? "/ (unresolved)" : ""}`,
      percent: `${(posterior * 100).toFixed(1)}%`,
    }));
  const width = Math.max(4, ...entries.map(({ node }) => node.length));
  return [{ node: "Node", percent: "%" }, ...entries]
    .map(({ node, percent }) => `${node.padEnd(width)}  ${percent.padStart(6)}`)
    .join("\n");
}
