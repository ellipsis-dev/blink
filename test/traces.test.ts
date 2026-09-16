import { expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.ts";

test.each([false, true])("persists walker IDs and paths across splits (API failure: %s)", async (fail) => {
  const temporary = await mkdtemp(join(tmpdir(), "blink-traces-"));
  const directory = join(temporary, "codebase");
  const searches = join(temporary, "searches");
  const apiKey = process.env.TYPESAFE_API_KEY;
  let searchDirectory = "";
  let initialIds: string[] = [];
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = await new Request(input, init).json();
    const [searchId] = await readdir(searches);
    searchDirectory = join(searches, searchId);
    const metadata = await Bun.file(join(searchDirectory, "metadata.json")).json();
    expect(metadata.status).toBe("running");
    const traces = await Promise.all(metadata.walkers.map(({ trace }: { trace: string }) =>
      Bun.file(join(searchDirectory, trace)).json()));
    if (request.state.directory === ".") {
      initialIds = traces.map((trace) => trace.walker_id).sort();
      expect(traces.every((trace) => trace.status === "running" && trace.steps.length === 0)).toBe(true);
    } else {
      expect(request.state.directory).toBe("child");
      expect(traces.map((trace) => trace.walker_id).sort()).toEqual(initialIds);
      expect(traces.filter((trace) => trace.status === "completed")).toHaveLength(4);
      expect(metadata.api_queries).toBe(1);
      if (fail) return Response.json({ error: "Fixture failure" }, { status: 400 });
    }
    const probabilities = request.state.directory === "."
      ? { child: 0.6, "root.ts": 0.4 }
      : { "a.ts": 0.8, "b.ts": 0.2 };
    return Response.json({
      model: "jev-resolved-test",
      answers: { entry: { type: "choice", choice: Object.keys(probabilities)[0], probabilities, confidence: 0.7 } },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
  });
  const output = spyOn(console, "log").mockImplementation(() => {});

  try {
    process.env.TYPESAFE_API_KEY = "mock-secret";
    await mkdir(join(directory, "child"), { recursive: true });
    for (const file of ["root.ts", "child/a.ts", "child/b.ts"]) await writeFile(join(directory, file), "");
    const run = main(["-n", "10", "find code", directory], searches);
    if (fail) await expect(run).rejects.toThrow();
    else await run;

    const metadata = await Bun.file(join(searchDirectory, "metadata.json")).json();
    const traces = await Promise.all(metadata.walkers.map(({ trace }: { trace: string }) =>
      Bun.file(join(searchDirectory, trace)).json()));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(metadata.id).toMatch(/^search_[a-f0-9]{32}$/);
    expect(metadata.status).toBe(fail ? "failed" : "completed");
    expect(metadata.root).toBe(directory);
    expect(metadata.query).toBe("find code");
    expect(metadata.finished_at).not.toBeNull();
    expect(metadata.duration_ms).toBeGreaterThan(0);
    expect(metadata.api_queries).toBe(fail ? 1 : 2);
    expect(metadata.input_tokens).toBe(fail ? 100 : 200);
    expect(metadata.output_tokens).toBe(fail ? 20 : 40);
    expect(metadata.estimated_cost_usd).toBeCloseTo((fail ? 100 : 200) * 0.042 / 1_000_000, 12);
    expect(metadata.decisions[0].model).toBe("jev-resolved-test");
    expect(metadata.decisions[0].options.map(({ walkers }: { walkers: number }) => walkers)).toEqual([6, 4]);
    expect(metadata.settings.ignoredNodes).toContain(".git");
    expect(metadata.walkers).toHaveLength(10);
    expect(new Set(initialIds).size).toBe(10);
    expect(traces.map((trace) => trace.walker_id).sort()).toEqual(initialIds);
    expect(traces.filter((trace) => trace.status === "running")).toHaveLength(0);
    expect(await readdir(join(searchDirectory, "traces"))).toHaveLength(10);
    for (const trace of traces) {
      expect(trace.id).toMatch(/^trace_[a-f0-9]{32}$/);
      expect(trace.walker_id).toMatch(/^walker_[a-f0-9]{32}$/);
      expect(trace.search_id).toBe(metadata.id);
      expect(metadata.walkers).toContainEqual({ walker_id: trace.walker_id, trace: `traces/${trace.id}.json` });
      expect(trace.steps[0].node).toBe(".");
      expect(JSON.stringify(trace)).not.toContain(directory);
    }
    if (fail) {
      expect(traces.filter((trace) => trace.status === "completed")).toHaveLength(4);
      expect(traces.filter((trace) => trace.status === "failed")).toHaveLength(6);
      expect(metadata.current_node).toBe("child");
      expect(metadata.error).not.toBeNull();
      expect(traces.filter((trace) => trace.status === "failed").every((trace) =>
        trace.steps[0].selected === "child" && trace.error)).toBe(true);
    } else {
      expect(metadata.results).toEqual([
        { node: "child/a.ts", status: "completed", walkers: 5, posterior: 0.5 },
        { node: "root.ts", status: "completed", walkers: 4, posterior: 0.4 },
        { node: "child/b.ts", status: "completed", walkers: 1, posterior: 0.1 },
      ]);
      for (const trace of traces.filter((trace) => trace.result === "child/a.ts")) {
        expect(trace.steps).toEqual([
          { node: ".", selected: "child", probability: 0.6 },
          { node: "child", selected: "a.ts", probability: 0.8 },
        ]);
      }
    }
    expect(JSON.stringify(metadata)).not.toContain("mock-secret");
  } finally {
    fetchMock.mockRestore();
    output.mockRestore();
    if (apiKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = apiKey;
    await rm(temporary, { recursive: true, force: true });
  }
});
