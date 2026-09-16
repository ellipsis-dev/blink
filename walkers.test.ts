import { expect, spyOn, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./blink.ts";
import { splitWalkers } from "./walkers.ts";

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
  const directory = join(import.meta.dir, "test", "example_codebase");
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
      usage: { input_tokens: 0, output_tokens: 0 },
    });
  });
  const output = spyOn(console, "log").mockImplementation(() => {});
  try {
    process.env.TYPESAFE_API_KEY = "mock-key";
    await main([flag, "100", ...verbose, "where is authentication handled?", directory]);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(visited.slice().sort()).toEqual(Object.keys(distributions).sort());
    expect(output.mock.calls.at(-1)![0]).toBe([
      "Node                                   %",
      "src/services/auth/login.ts         66.0%",
      "src/ui/button.ts                   13.0%",
      "docs/setup.md                      10.0%",
      "src/services/billing/invoices.ts    8.0%",
      "src/services/auth/session.ts        3.0%",
    ].join("\n"));
    expect(JSON.stringify(output.mock.calls)).not.toContain(directory);
    if (!verbose.length) expect(output).toHaveBeenCalledTimes(1);
    else {
      expect(output.mock.calls.filter(([label]) => label === "Request:")).toHaveLength(7);
      expect(output.mock.calls.filter(([label]) => label === "Response:")).toHaveLength(7);
    }
    const steps = output.mock.calls.filter(([label]) => label !== "Request:" && label !== "Response:")
      .slice(0, -1).map(([json]) => JSON.parse(json));
    for (const node of steps) {
      expect(node.options.reduce((sum: number, option: { walkers: number }) => sum + option.walkers, 0))
        .toBe(node.walkers);
    }
  } finally {
    fetchMock.mockRestore();
    output.mockRestore();
    if (apiKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = apiKey;
  }
});

test("reports walkers reaching empty directories without renormalizing the files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blink-walkers-"));
  const apiKey = process.env.TYPESAFE_API_KEY;
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({
    model: "jev-latest",
    answers: { entry: { type: "choice", choice: "found.ts", probabilities: { "found.ts": 0.6, empty: 0.4 }, confidence: 0.5 } },
    usage: { input_tokens: 0, output_tokens: 0 },
  }));
  const output = spyOn(console, "log").mockImplementation(() => {});
  try {
    process.env.TYPESAFE_API_KEY = "mock-key";
    await mkdir(join(directory, "empty"));
    await writeFile(join(directory, "found.ts"), "");
    await main(["-r", "-n", "10", "query", directory]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(output.mock.calls.at(-1)![0])
      .toBe("Node                      %\nfound.ts              60.0%\nempty/ (unresolved)   40.0%");
    expect(output).toHaveBeenCalledTimes(1);
  } finally {
    fetchMock.mockRestore();
    output.mockRestore();
    if (apiKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = apiKey;
    await rm(directory, { recursive: true, force: true });
  }
});

test.each(["0", "-1", "1.5", "NaN", "10000000000000000", ""])("rejects invalid walker count %s", async (count) => {
  await expect(main([`--n_walkers=${count}`, "query", "missing-directory"]))
    .rejects.toThrow("positive integer");
});
