# xxscreeps CLI

Operator-facing JavaScript REPL and one-shot evaluator. Both run inside a curated `node:vm` context isolated from the host process and the engine sandbox.

## Commands

### `xxscreeps cli`

Interactive REPL backed by `node:repl`. Bare `xxscreeps` (no subcommand) is an alias.

- Variables persist across turns: `var x = 1; x` then `x + 1` works.
- Top-level `await` works at the prompt.
- Multi-line input is recoverable: typing `if (x) {` reprompts until the block closes.
- `node:repl` meta-commands are intact: `.help`, `.exit`, `.load`, `.save`.

### `xxscreeps eval`

One-shot evaluator. Source comes from exactly one of `-e/--expression`, `--file`, or `--stdin`.

| Flag | Description |
|---|---|
| `-e, --expression <code>` | Evaluate a string |
| `--file <path>` | Read a file (cwd-relative or absolute) |
| `--stdin` | Read source from stdin until EOF |
| `--json` | Emit a structured JSON envelope to stdout |
| `-- arg …` | Trailing positionals exposed inside the script as `argv: string[]` |

Plain mode streams console output as it happens (`log`/`info` → stdout, `warn`/`error` → stderr), then prints the inspected return value to stdout. Thrown errors go to stderr. Exit `0` on success, `1` on throw.

JSON mode buffers all console output and the result into a single envelope written to stdout:

```ts
interface EvalEnvelope {
    ok: boolean;
    result?: unknown;       // present iff ok; replaced with { __nonJsonResult: <util.inspect string> } when not JSON-serializable
    logs: string[];         // console.log + console.info
    warnings: string[];     // console.warn
    errors: string[];       // console.error (does NOT include thrown)
    thrown?: { name: string; message: string; stack: string }; // present iff !ok
}
```

Same exit codes as plain mode. Nothing is written to stderr in JSON mode.

## Curated context

Exposed to evaluated code:

- Standard JS built-ins (`Math`, `JSON`, `Promise`, `Date`, `Map`, `Set`, `Symbol`, `RegExp`, `Array`, `Object`, …) — fresh per realm via `vm.createContext`.
- Web APIs: `URL`, `URLSearchParams`, `TextEncoder`, `TextDecoder`.
- Timers: `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask`, `setImmediate`, `clearImmediate`.
- `console`, routed per mode.
- `argv: string[]` (eval only) populated from trailing positionals.

Intentionally absent: `process`, `require`, dynamic `import()`, `Buffer`, `__dirname`, `__filename`, and any engine state (`Game`, `Memory`, `shard`, `db`). A live-mode bridge exposing engine state from a running server is a planned follow-up.
