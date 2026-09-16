# blink

Search a codebase with [Jev](https://docs.typesafe.ai/concepts/system-one) through the [TypeSafe SDK](https://docs.typesafe.ai/sdk/javascript). Requires Bun 1.3.14+.

```sh
bun install
export TYPESAFE_API_KEY="your-key"
```

## Using

Pass a natural-language query and a directory to rank where to look; add `-r` to find a file or `-n` to explore multiple paths.

```sh
./blink "query" "directory" [options]
```

## Example

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

Search the included [example codebase](test/example_codebase) with 100 walkers:

```sh
./blink "where is authentication handled?" test/example_codebase -n 100
```

Example output from the mocked test; live results will vary:

```text
Node                                   %
src/services/auth/login.ts         66.0%
src/ui/button.ts                   13.0%
docs/setup.md                      10.0%
src/services/billing/invoices.ts    8.0%
src/services/auth/session.ts        3.0%
```

## How it works

Jev ranks each visited directory's immediate children using their names and types. Walkers split according to those probabilities, rounding down and assigning leftover walkers to the largest fractional remainders, then continue until they reach files. Each percentage is the number ending at that node divided by the starting count; empty directories appear as unresolved, and paths are relative to the search directory.

Run `bun test` to check the example with mocked responses and no API key.

## Options

| Short | Long | Behavior |
| --- | --- | --- |
| `-r` | `--recursive` | Follow one walker down the most likely path to a file. |
| `-n 100` | `--n_walkers 100` | Split 100 walkers across paths; enables recursion. |
| `-v` | `--verbose` | Print requests, responses, and walker allocations before the final table. |

Without `-r` or `-n`, Blink ranks only immediate subdirectories.

## Settings

Edit [settings.json](settings.json) to ignore exact file or directory names at every depth:

```json
{
  "ignoredNodes": [".git"]
}
```
