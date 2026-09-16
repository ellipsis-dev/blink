# blink

Search a codebase with [Jev](https://docs.typesafe.ai/concepts/system-one) through the [TypeSafe SDK](https://docs.typesafe.ai/sdk/javascript). Requires Bun 1.3.14+.

```sh
bun install
export TYPESAFE_API_KEY="your-key"
```

## Example

Search the included [example codebase](test/example_codebase) with 100 walkers:

```sh
./blink "where is authentication handled?" test/example_codebase -n 100
```

Example output from the mocked test; live results will vary:

```text
      %  Node
 66.00%  src/services/auth/login.ts
 13.00%  src/ui/button.ts
 10.00%  docs/setup.md
  8.00%  src/services/billing/invoices.ts
  3.00%  src/services/auth/session.ts
```

## How it works

Jev ranks each visited directory's immediate children using their names and types. Walkers split according to those probabilities, rounding down and assigning leftover walkers to the largest fractional remainders, then continue until they reach files. Each percentage is the number ending at that node divided by the starting count; empty directories appear as unresolved, and paths are relative to the search directory.

Run `bun test` to check the example with mocked responses and no API key.

## Options

```sh
./blink "query" "directory" [options]
```

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
