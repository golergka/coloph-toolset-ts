import { Brand } from "effect";
import { z } from "zod";
import { type ReadonlyData, tool, toolset } from "../src/index.js";

type Id = string & Brand.Brand<"Id">;
const id = z.string().transform(Brand.nominal<Id>());
const read = tool<{ id: Id }>()({
  description: "Read an ID",
  input: z.null(),
  output: id,
  run: (context) => context.id,
});
export const typed: Id = read.execute({ id: id.parse("one") }, null);
// @ts-expect-error Context requires a branded ID.
read.execute({ id: "one" }, null);
tool<undefined>()({
  description: "Wrong",
  input: z.null(),
  output: z.number(),
  // @ts-expect-error Handler output must match the schema.
  run: () => "wrong",
});
tool<undefined>()({
  description: "Async",
  input: z.null(),
  output: z.number(),
  // @ts-expect-error Async handlers are outside the synchronous contract.
  run: () => Promise.resolve(1),
});
// @ts-expect-error A caller must supply the required context.
toolset({ read }).invoke({}, { name: "read", arguments: null });

export function readBrandedPrimitive(
  data: ReadonlyData<{ rows: { id: Id }[] }>,
): Id | undefined {
  return data.rows[0]?.id;
}
