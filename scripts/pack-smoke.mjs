import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const temporary = mkdtempSync(join(tmpdir(), "toolset-package-"));
try {
  const packed = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--pack-destination", temporary], {
      encoding: "utf8",
    }),
  );
  writeFileSync(
    join(temporary, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(temporary, packed[0].filename),
    ],
    { cwd: temporary, stdio: "pipe" },
  );
  const consumer = `import { tool, toolset } from "coloph-toolset-ts";
import { Result } from "effect";
import { z } from "zod";
const add = tool<{ count: number }>()({ description: "Add", input: z.number(), output: z.number(), run: (state, amount) => state.count += amount });
const result: number = add.execute({count: 1}, 2);
if (result !== 3 || Result.getOrThrow(toolset({add}).invoke({count: 2}, {name: "add", arguments: 3})) !== 5) throw new Error("Package contract failed");
`;
  writeFileSync(join(temporary, "consumer.ts"), consumer);
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/typescript/bin/tsc"),
      "--strict",
      "--skipLibCheck",
      "false",
      "--module",
      "nodenext",
      "--lib",
      "es2023,esnext.disposable,dom",
      "--target",
      "es2023",
      "consumer.ts",
    ],
    { cwd: temporary, stdio: "inherit" },
  );
  for (const runtime of [process.execPath, "bun"])
    execFileSync(runtime, ["consumer.js"], {
      cwd: temporary,
      stdio: "inherit",
    });
  console.log("Packed declarations and Node/Bun imports passed");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
