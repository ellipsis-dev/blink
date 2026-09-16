# blink

Search a codebase with [Jev](https://docs.typesafe.ai/concepts/system-one) using the [TypeSafe SDK](https://docs.typesafe.ai/sdk/javascript); requires Bun 1.3.14+.

```sh
bun install
export TYPESAFE_API_KEY="your-key"
./blink -r "where is authentication handled?" "/path/to/repository"
```

`-r` / `--recursive` follows the highest-probability entry until reaching a file, printing each request, response, and ranked options; omit it to rank only immediate subdirectories.

Run `bun test` for the mocked example: `src (0.9) → services (0.85) → auth (0.9) → login.ts (0.95)`, with no API key needed.

Edit [settings.json](settings.json) to ignore file or directory names at every depth:

```json
{
  "ignoredNodes": [".git"]
}
```
