import { expect, spyOn, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./blink.ts";
import { step } from "./search.ts";

test("follows three nested directories, then stops at the most likely file", async () => {
  const directory = join(import.meta.dir, "test", "example_codebase");
  const query = "where is authentication handled?";
  const apiKey = process.env.TYPESAFE_API_KEY;
  const requests: { state: { query: string; directory: string } }[] = [];
  const probabilities: Record<string, number>[] = [
    { src: 0.9, docs: 0.1 },
    { services: 0.85, ui: 0.15 },
    { auth: 0.9, billing: 0.1 },
    { "login.ts": 0.95, "session.ts": 0.05 },
  ];
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = await new Request(input, init).json();
    const distribution = probabilities[requests.length];
    requests.push(request);
    if (!distribution) throw new Error("Unexpected API call after reaching a file.");
    expect(Object.keys(request.questions.entry.criteria).sort())
      .toEqual(Object.keys(distribution).sort());
    expect(request.state.candidates.map(({ name }: { name: string }) => name).sort())
      .toEqual(Object.keys(distribution).sort());
    return Response.json({
      model: "jev-latest",
      answers: {
        entry: {
          type: "choice",
          choice: Object.keys(distribution)[0],
          probabilities: distribution,
          confidence: 0.9,
        },
      },
      usage: { input_tokens: 0, output_tokens: 0 },
    });
  });
  const output = spyOn(console, "log").mockImplementation(() => {});

  try {
    process.env.TYPESAFE_API_KEY = "mock-key";
    await main(["-r", "--verbose", query, directory]);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(requests.map(({ state }) => ({ query: state.query, directory: state.directory })))
      .toEqual([
        { query, directory: "." },
        { query, directory: "src" },
        { query, directory: "src/services" },
        { query, directory: "src/services/auth" },
      ]);
    expect(output.mock.calls.at(-1)![0])
      .toBe("┌────────────────────────────┬────────┐\n│ Node                       │      % │\n├────────────────────────────┼────────┤\n│ src/services/auth/login.ts │ 100.0% │\n└────────────────────────────┴────────┘");
    expect(output.mock.calls.at(-2)![0])
      .toMatch(/^Duration: \d+\.\d{2}s\nAPI queries: 4\nEst\. cost: \$0\.00000000\n$/);
    expect(JSON.stringify(output.mock.calls)).not.toContain(directory);
    expect(output.mock.calls.filter(([label]) => label === "Request:")).toHaveLength(4);
    expect(output.mock.calls.filter(([label]) => label === "Response:")).toHaveLength(4);
  } finally {
    fetchMock.mockRestore();
    output.mockRestore();
    if (apiKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = apiKey;
  }
});

test("ignores matching files and directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blink-ignore-test-"));
  try {
    await mkdir(join(directory, "folder", ".git"), { recursive: true });
    await mkdir(join(directory, "file"));
    await writeFile(join(directory, "file", ".git"), "gitdir: ../folder/.git");
    for (const name of ["folder", "file"]) {
      for (const includeFiles of [false, true]) {
        expect(await step({ query: "authentication", directory: join(directory, name) }, includeFiles))
          .toEqual({ options: [] });
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test.each([{ flags: [] }, { flags: ["-n", "100"] }])("reports zero API queries and cost for an empty directory with %j", async ({ flags }) => {
  const directory = await mkdtemp(join(tmpdir(), "blink-empty-test-"));
  const output = spyOn(console, "log").mockImplementation(() => {});
  try {
    await main([...flags, "query", directory]);
    expect(output.mock.calls.at(-2)![0])
      .toMatch(/^Duration: \d+\.\d{2}s\nAPI queries: 0\nEst\. cost: \$0\.00000000\n$/);
  } finally {
    output.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});
