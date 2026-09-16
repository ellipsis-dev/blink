# blink

Requires Bun 1.3.14+ and a TypeSafe API key. Uses the official TypeSafe SDK;
no build step.

```sh
bun install
export TYPESAFE_API_KEY="your-key"
./blink "where is authentication handled?" "/path/to/repository"
```

Prints the request JSON before each Jev call and the response JSON afterward,
then immediate subdirectories and their probabilities, highest first:

```json
{
  "options": [
    { "directory": "/path/to/repository/src", "probability": 0.8 },
    { "directory": "/path/to/repository/tests", "probability": 0.2 }
  ]
}
```

Probabilities above are illustrative. Only the query, current directory path,
and immediate subdirectory names are sent to Jev; file contents are not read.
Hidden directories are included; symbolic links are not followed.
No subdirectories produces `{"options": []}` without an API call.

`step({ query, directory })` returns `{ options }`. Choose an option and use
its directory with the same query for the next step. Each invocation ranks
one directory's children; it does not recurse or choose a path automatically.

SDK: https://docs.typesafe.ai/sdk/javascript
