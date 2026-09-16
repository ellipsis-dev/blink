# blink

Search a codebase with [Jev](https://docs.typesafe.ai/concepts/system-one) using an ensemble of walkers that walk the file system to find a file. 

Pass a natural-language query and a directory. Use `-r` to search recursively and `-n` to explore using multiple walkers.

```sh
./blink "query" "directory" [--recursive] [--n_walkers 100]
```

###  Set up
Requires Bun 1.3.14+.
```sh
bun install
export TYPESAFE_API_KEY="your-key"
```

## Examples

Imagine you have a file tree like this:

```text
test/example_codebase/
├── src/
│   ├── services/
│   │   ├── auth/
│   │   │   ├── login.ts
│   │   │   └── session.ts
│   │   └── billing/
│   │       └── invoices.ts
│   └── ui/
│       └── button.ts
└── docs/
    └── setup.md
```

and you want to find where the authenticate code is handled. You might do:

```sh
./blink "where is authentication handled?" test/example_codebase --n_walkers 100 --recursive
```

and your results would look like

```text
┌──────────────────────────────┬────────┐
│ Node                         │      % │
├──────────────────────────────┼────────┤
│ src/services/auth/login.ts   │  74.0% │
├──────────────────────────────┼────────┤
│ src/services/auth/session.ts │  16.0% │
├──────────────────────────────┼────────┤
│ src/ui/button.ts             │  10.0% │
└──────────────────────────────┴────────┘
```

Similarily,

```sh
./blink "where are invoices generated?" test/example_codebase --n_walkers 100 --recursive
```
returns 
```text
┌──────────────────────────────────┬────────┐
│ Node                             │      % │
├──────────────────────────────────┼────────┤
│ src/services/billing/invoices.ts │  82.0% │
├──────────────────────────────────┼────────┤
│ src/ui/button.ts                 │  11.0% │
├──────────────────────────────────┼────────┤
│ docs/setup.md                    │   7.0% │
└──────────────────────────────────┴────────┘
```

and it finds top level files successfully too

```sh
./blink "where is the reusable button component?" test/example_codebase --n_walkers 100 --recursive
```

```text
┌──────────────────┬────────┐
│ Node             │      % │
├──────────────────┼────────┤
│ src/ui/button.ts │ 100.0% │
└──────────────────┴────────┘
```

## How it works

Jev scores file and folder names. More likely paths get more walkers, which keep moving until they reach a file. Each result shows the percentage of starting walkers that ended there.

The table shows the top 10 results and groups the rest as `OTHER`. Empty folders are marked `unresolved`, and paths start from the folder you searched.

Run `bun test` to test with fake API responses; no API key is needed.

The summary shows how long the search took, how many API calls completed (not counting retries), and estimated cost. [Jev charges](https://typesafe.ai/blog/introducing-system-one-models-and-jev) $0.042 per million input tokens; output tokens are free.

## Options

| Short | Long | Behavior |
| --- | --- | --- |
| `-r` | `--recursive` | Follow one walker down the most likely path to a file. |
| `-n 100` | `--n_walkers 100` | Split 100 walkers across paths; enables recursion. |
| `-v` | `--verbose` | Print requests, responses, and walker allocations before the final table. |

Without `-r` or `-n`, Blink ranks only immediate subdirectories.

## Saved searches

Recursive searches (`-r` or `-n`) save their output beside Blink:

```text
output/searches/search_abc123/
├── metadata.json
└── traces/
    ├── trace_abc123.json
    └── trace_def456.json
```

Each walker gets a unique `walker_id` such as `walker_abc123`, kept throughout its path. Its trace records every choice, probability, final destination, and status; 100 walkers produce 100 trace files.

Metadata records the query, settings, timestamps, shared Jev decisions, token usage, cost, and complete results. Files are updated after every step, including when a search fails. Generated output is ignored by Git and excluded from searches of Blink itself.

## Settings

Edit [settings.json](settings.json) to ignore exact file or directory names at every depth:

```json
{
  "ignoredNodes": [".git"]
}
```
