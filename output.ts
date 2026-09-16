import { isAbsolute, relative, resolve } from "node:path";

export function formatJSON(value: unknown, root: string): string {
  return JSON.stringify(value, (key, value) =>
    (key === "directory" || key === "file") && typeof value === "string" && isAbsolute(value)
      ? relative(resolve(root), value) || "."
      : value, 2);
}

export function formatTable(rows: { path: string; posterior: number; unresolved?: boolean }[], root: string): string {
  return ["      %  Node", ...rows
    .sort((a, b) => b.posterior - a.posterior || a.path.localeCompare(b.path))
    .map(({ path, posterior, unresolved }) =>
      `${(posterior * 100).toFixed(2).padStart(6)}%  ${relative(resolve(root), path) || "."}${unresolved ? "/ (unresolved)" : ""}`)]
    .join("\n");
}
