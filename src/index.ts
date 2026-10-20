import { Result } from "effect";
import { z } from "zod";

export type ReadonlyData<T> = T extends object
  ? { readonly [K in keyof T]: ReadonlyData<T[K]> }
  : T;

export interface Tool<C, I = unknown, O = unknown> {
  readonly description: string;
  readonly input: z.ZodType<I>;
  readonly output: z.ZodType<O>;
  readonly execute: (context: C, input: unknown) => O;
}

/** Declare synchronous tools. The host owns context, authorization and transactions. */
export function tool<C>() {
  return <I, O>(definition: {
    readonly description: string;
    readonly input: z.ZodType<I>;
    readonly output: z.ZodType<O>;
    readonly run: (context: C, input: I) => ReadonlyData<O>;
  }): Tool<C, I, O> => ({
    description: definition.description,
    input: definition.input,
    output: definition.output,
    execute: (context, raw) =>
      definition.output.parse(
        definition.run(context, definition.input.parse(raw)),
      ),
  });
}

export const requestSchema = z.strictObject({
  name: z.string(),
  arguments: z.json(),
});
export type Request = z.infer<typeof requestSchema>;
export type Json = z.infer<ReturnType<typeof z.json>>;

/** Only explicitly supplied tools are discoverable or callable. Context is never serialized. */
export function toolset<C>(tools: Readonly<Record<string, Tool<C>>>) {
  const entries = new Map(Object.entries(tools));
  const descriptions = [...entries].map(([name, operation]) => {
    z.string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/)
      .parse(name);
    return {
      name,
      description: operation.description,
      inputSchema: z.toJSONSchema(operation.input, { io: "input" }),
      // Representation-preserving transforms (such as brands) use their wire schema.
      outputSchema: z.toJSONSchema(operation.output, { io: "input" }),
    };
  });
  return {
    describe: () => structuredClone(descriptions),
    invoke: (context: C, raw: unknown): Result.Result<Json, unknown> =>
      Result.try(() => {
        const request = requestSchema.parse(raw);
        const operation = entries.get(request.name);
        if (!operation) throw new Error(`Unknown tool: ${request.name}`);
        const result = z
          .json()
          .parse(operation.execute(context, request.arguments));
        const reparsed = z.json().parse(operation.output.parse(result));
        if (JSON.stringify(result) !== JSON.stringify(reparsed)) {
          throw new Error(
            "Output schema must preserve its serialized representation",
          );
        }
        return structuredClone(result);
      }),
  };
}
