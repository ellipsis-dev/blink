import { expect, spyOn, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.ts";
import { splitWalkers } from "../src/walkers.ts";
import { formatTable } from "../src/output.ts";

test("shows the ten most common destinations and combines the rest into OTHER", () => {
  const root = import.meta.dir;
  const rows = [19, 15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((percent, index) => ({
    path: join(root, `${index + 1}.ts`), posterior: percent / 100,
  }));
  const lines = formatTable(rows.reverse(), root).split("\n")
    .filter((line) => line.startsWith("│")).slice(1)
    .map((line) => line.split("│").slice(1, -1).map((cell) => cell.trim()));
  expect(lines.map(([node]) => node))
    .toEqual(["1.ts", "2.ts", "3.ts", "4.ts", "5.ts", "6.ts", "7.ts", "8.ts", "9.ts", "10.ts", "OTHER"]);
  expect(lines.at(-1)).toEqual(["OTHER", "5.0%"]);
  expect(lines.reduce((sum, [, percent]) => sum + parseFloat(percent), 0)).toBe(100);
});

test("allocates whole walkers by largest remainder without losing any", () => {
  expect(splitWalkers(10, [0.65, 0.35])).toEqual([7, 3]);
  expect(splitWalkers(3, [0.5, 0.3, 0.2])).toEqual([1, 1, 1]);
  expect(splitWalkers(1, [0.1, 0.9, 0])).toEqual([0, 1, 0]);
  expect(splitWalkers(10, [0.333, 0.333, 0.333])).toEqual([4, 3, 3]);
  expect(() => splitWalkers(10, [0, 0])).toThrow("invalid probabilities");
  expect(() => splitWalkers(10, [NaN, 1])).toThrow("invalid probabilities");
  expect(() => splitWalkers(10, [-0.1, 1.1])).toThrow("invalid probabilities");
});

test.each([
  { flag: "-n", verbose: [] },
  { flag: "--n_walkers", verbose: ["--verbose"] },
  { flag: "-n", verbose: ["-v"] },
])("reports a relative-path percentage table with verbosity %j", async ({ flag, verbose }) => {
  const searches = await mkdtemp(join(tmpdir(), "blink-searches-"));
  const directory = join(import.meta.dir, "example_codebase");
  const distributions: Record<string, Record<string, number>> = {
    "": { src: 0.9, docs: 0.1 },
    src: { services: 0.85, ui: 0.15 },
    docs: { "setup.md": 1 },
    "src/services": { auth: 0.9, billing: 0.1 },
    "src/ui": { "button.ts": 1 },
    "src/services/auth": { "login.ts": 0.95, "session.ts": 0.05 },
    "src/services/billing": { "invoices.ts": 1 },
  };
  const visited: string[] = [];
  const apiKey = process.env.TYPESAFE_API_KEY;
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = await new Request(input, init).json();
    const path = request.state.directory === "." ? "" : request.state.directory;
    expect(visited).not.toContain(path);
    visited.push(path);
    const probabilities = distributions[path];
    expect(request.state.query).toBe("where is authentication handled?");
    expect(Object.keys(request.questions.entry.criteria).sort()).toEqual(Object.keys(probabilities).sort());
    return Response.json({
      model: "jev-latest",
      answers: { entry: { type: "choice", choice: Object.keys(probabilities)[0], probabilities, confidence: 0.1 } },
      usage: { input_tokens: visited.length * 100, output_tokens: 1000 },
    });
  });
  const output = spyOn(console, "log").mockImplementation(() => {});
  try {
    process.env.TYPESAFE_API_KEY = "mock-key";
    await main([flag, "100", ...verbose, "where is authentication handled?", directory], searches);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(visited.slice().sort()).toEqual(Object.keys(distributions).sort());
    expect(output.mock.calls.at(-1)![0]).toBe([
      "┌──────────────────────────────────┬────────┐",
      "│ Node                             │      % │",
      "├──────────────────────────────────┼────────┤",
      "│ src/services/auth/login.ts       │  66.0% │",
      "├──────────────────────────────────┼────────┤",
      "│ src/ui/button.ts                 │  13.0% │",
      "├──────────────────────────────────┼────────┤",
      "│ docs/setup.md                    │  10.0% │",
      "├──────────────────────────────────┼────────┤",
      "│ src/services/billing/invoices.ts │   8.0% │",
      "├──────────────────────────────────┼────────┤",
      "│ src/services/auth/session.ts     │   3.0% │",
      "└──────────────────────────────────┴────────┘",
    ].join("\n"));
    expect(output.mock.calls.at(-2)![0])
      .toMatch(/^Duration: \d+\.\d{2}s\nAPI queries: 7\nEst\. cost: \$0\.00011760\n$/);
    expect(JSON.stringify(output.mock.calls)).not.toContain(directory);
    if (!verbose.length) expect(output).toHaveBeenCalledTimes(2);
    else {
      expect(output.mock.calls.filter(([label]) => label === "Request:")).toHaveLength(7);
      expect(output.mock.calls.filter(([label]) => label === "Response:")).toHaveLength(7);
    }
    const steps = output.mock.calls.filter(([label]) => label !== "Request:" && label !== "Response:")
      .slice(0, -2).map(([json]) => JSON.parse(json));
    for (const node of steps) {
      expect(node.options.reduce((sum: number, option: { walkers: number }) => sum + option.walkers, 0))
        .toBe(node.walkers);
    }
  } finally {
    fetchMock.mockRestore();
    output.mockRestore();
    if (apiKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = apiKey;
    await rm(searches, { recursive: true, force: true });
  }
});

test("reports walkers reaching empty directories without renormalizing the files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blink-walkers-"));
  const searches = await mkdtemp(join(tmpdir(), "blink-searches-"));
  const apiKey = process.env.TYPESAFE_API_KEY;
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({
    model: "jev-latest",
    answers: { entry: { type: "choice", choice: "found.ts", probabilities: { "found.ts": 0.6, empty: 0.4 }, confidence: 0.5 } },
    usage: { input_tokens: 500, output_tokens: 1000 },
  }));
  const output = spyOn(console, "log").mockImplementation(() => {});
  try {
    process.env.TYPESAFE_API_KEY = "mock-key";
    await mkdir(join(directory, "empty"));
    await writeFile(join(directory, "found.ts"), "");
    await main(["-r", "-n", "10", "query", directory], searches);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(output.mock.calls.at(-1)![0])
      .toBe("┌─────────────────────┬────────┐\n│ Node                │      % │\n├─────────────────────┼────────┤\n│ found.ts            │  60.0% │\n├─────────────────────┼────────┤\n│ empty/ (unresolved) │  40.0% │\n└─────────────────────┴────────┘");
    expect(output.mock.calls.at(-2)![0])
      .toMatch(/^Duration: \d+\.\d{2}s\nAPI queries: 1\nEst\. cost: \$0\.00002100\n$/);
    expect(output).toHaveBeenCalledTimes(2);
  } finally {
    fetchMock.mockRestore();
    output.mockRestore();
    if (apiKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = apiKey;
    await rm(directory, { recursive: true, force: true });
    await rm(searches, { recursive: true, force: true });
  }
});

test.each(["0", "-1", "1.5", "NaN", "10000000000000000", ""])("rejects invalid walker count %s", async (count) => {
  await expect(main([`--n_walkers=${count}`, "query", "missing-directory"]))
    .rejects.toThrow("positive integer");
});
