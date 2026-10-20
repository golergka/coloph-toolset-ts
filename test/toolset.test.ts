import { Brand, Result } from "effect";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { tool, toolset } from "../src/index.js";

const declare = tool<{ count: number }>();
const add = declare({
  description: "Add to the counter",
  input: z.strictObject({ amount: z.int() }),
  output: z.int(),
  run: (context, input) => (context.count += input.amount),
});

describe("public contracts", () => {
  it("injects the current host context and keeps it out of discovery", () => {
    const tools = toolset({ add });
    const first = { count: 1 };
    const second = { count: 10 };
    expect(
      Result.getOrThrow(
        tools.invoke(first, { name: "add", arguments: { amount: 2 } }),
      ),
    ).toBe(3);
    expect(
      Result.getOrThrow(
        tools.invoke(second, { name: "add", arguments: { amount: 2 } }),
      ),
    ).toBe(12);
    const descriptions = tools.describe();
    expect(descriptions).toMatchObject([
      {
        name: "add",
        description: "Add to the counter",
        inputSchema: {
          type: "object",
          properties: { amount: { type: "integer" } },
        },
        outputSchema: { type: "integer" },
      },
    ]);
    descriptions.length = 0;
    expect(tools.describe()).toHaveLength(1);
    expect(JSON.stringify(tools.describe())).not.toContain('"count"');
  });

  it("validates requests and arguments before running a tool", () => {
    const context = { count: 0 };
    const tools = toolset({ add });
    for (const request of [
      null,
      { name: "add", arguments: {} },
      { name: "add", arguments: { amount: "1" } },
      { name: "add", arguments: { amount: 1 }, context },
      { name: "add", arguments: { amount: 1, extra: 0 } },
    ]) {
      expect(Result.isFailure(tools.invoke(context, request))).toBe(true);
    }
    expect(context.count).toBe(0);
  });

  it("only dispatches explicitly registered tools and snapshots the registry", () => {
    const registry = { add };
    const tools = toolset(registry);
    Object.assign(registry, { secret: add });
    for (const name of ["secret", "toString", "constructor", "__proto__"]) {
      expect(() =>
        Result.getOrThrow(tools.invoke({ count: 0 }, { name, arguments: {} })),
      ).toThrow(`Unknown tool: ${name}`);
    }
    expect(toolset({}).describe()).toEqual([]);
    expect(() => toolset({ "bad name": add })).toThrow();
  });

  it("captures handler and schema failures without promising rollback", () => {
    const fault = new Error("domain rule");
    const bad = declare({
      description: "Fail",
      input: z.null(),
      output: z.int(),
      run: (context) => {
        context.count++;
        throw fault;
      },
    });
    const context = { count: 0 };
    const result = toolset({ bad }).invoke(context, {
      name: "bad",
      arguments: null,
    });
    expect(Result.isFailure(result) && result.failure).toBe(fault);
    expect(context.count).toBe(1);
    const invalid = declare({
      description: "Invalid output",
      input: z.null(),
      output: z.int().positive(),
      run: () => -1,
    });
    expect(
      Result.isFailure(
        toolset({ invalid }).invoke(context, {
          name: "invalid",
          arguments: null,
        }),
      ),
    ).toBe(true);
  });

  it("supports Effect brands and isolates returned JSON", () => {
    type Id = string & Brand.Brand<"Id">;
    const id = z.string().transform(Brand.nominal<Id>());
    const state = { id: "item/wood" };
    const read = tool<typeof state>()({
      description: "Read",
      input: z.null(),
      output: z.object({ id }),
      run: (context) => ({ id: id.parse(context.id) }),
    });
    const tools = toolset({ read });
    expect(tools.describe()).toMatchObject([
      { outputSchema: { properties: { id: { type: "string" } } } },
    ]);
    expect(
      Result.getOrThrow(tools.invoke(state, { name: "read", arguments: null })),
    ).toEqual(state);
    const returned = read.execute(state, null);
    returned.id = id.parse("item/iron");
    expect(state.id).toBe("item/wood");
  });

  it("rejects non-JSON output and transforms that change the wire representation", () => {
    const nonJson = tool<undefined>()({
      description: "Not JSON",
      input: z.null(),
      output: z.unknown(),
      run: () => new Date(),
    });
    expect(
      Result.isFailure(
        toolset({ nonJson }).invoke(undefined, {
          name: "nonJson",
          arguments: null,
        }),
      ),
    ).toBe(true);
    const change = tool<undefined>()({
      description: "Changes",
      input: z.null(),
      output: z.number().transform((n) => n + 1),
      run: () => 0,
    });
    expect(() =>
      Result.getOrThrow(
        toolset({ change }).invoke(undefined, {
          name: "change",
          arguments: null,
        }),
      ),
    ).toThrow("preserve its serialized representation");
    const unsupported = tool<undefined>()({
      description: "Unsupported",
      input: z.date(),
      output: z.null(),
      run: () => null,
    });
    expect(() => toolset({ unsupported })).toThrow();
  });
});
