# coloph-toolset-ts

Small synchronous tools for TypeScript hosts and agents. Zod defines arguments and results. Effect `Result` carries dispatch success or failure.

This project and [Python coloph-toolset](https://github.com/golergka/coloph-toolset) are separate libraries.
They share the general idea of typed tools with injected context. Their APIs, features, versions, and releases are independent.
Feature parity is not a goal.

## Install

```sh
bun add https://github.com/golergka/coloph-toolset-ts/releases/download/v0.1.1/coloph-toolset-ts-0.1.1.tgz
```

The GitHub release contains a standard npm package. It works with Bun and Node 22 or later. This package is not published to npm.

## Use

```ts
import { tool, toolset } from "coloph-toolset-ts";
import { Result } from "effect";
import { z } from "zod";

const declare = tool<{ count: number }>();
const add = declare({
  description: "Add to the counter",
  input: z.strictObject({ amount: z.int() }),
  output: z.int(),
  run: (context, { amount }) => (context.count += amount),
});
const tools = toolset({ add });
const state = { count: 0 };

tools.describe(); // JSON Schema contracts, with no context data
const result = tools.invoke(state, { name: "add", arguments: { amount: 2 } });
console.log(Result.getOrThrow(result)); // 2
```

`add.execute(state, rawArguments)` returns its schema's TypeScript output type and throws on failure.
`tools.invoke(context, request)` returns `Result<Json, unknown>` and retains the original error.
The host decides which errors are safe to send to an agent. Error objects are not automatically serialized.

Context is host-owned and supplied for each call. Separate toolsets define separate capabilities.
Only registered names are callable. A caller cannot supply context through serialized arguments.

Handlers must be synchronous. Results must be JSON. Schemas must support Zod's JSON Schema export.
Output transforms must preserve the serialized representation, as Effect brands do.
Dispatch reparses results and rejects unstable transformations; it does not prove arbitrary transforms correct.
Use a separate mapping step for changes to the wire format.
JSON Schema cannot describe every Zod refinement; runtime Zod validation remains authoritative.

The host owns transactions, persistence, authentication, authorization, and transport.
A failed handler can mutate context before it fails. Use a draft context when calls require rollback.
No HTTP server, model SDK, decorators, or Effect runtime is required.

## Development

```sh
bun install --frozen-lockfile
bun run check
```

Checks require strict TypeScript, type-aware ESLint with zero warnings, formatting, and 100% source coverage.
The package smoke installs the packed artifact in a temporary project, checks its declarations, and runs it with Node and Bun.
CI repeats these checks on Node 22 and 24. TypeScript consumers of the Effect barrel need the `esnext.disposable` library.

Before a release, run all checks and wait for CI on the exact commit.
Create a new version tag and upload the output of `npm pack` to its GitHub release.
Never replace an existing tag or package artifact.
