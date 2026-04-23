import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const IMPORT_EXTENSION_PATTERN =
  /from\s+["'][^"']+\.ts["']|import\s*\(\s*["'][^"']+\.ts["']\s*\)/g;

describe("standalone backfill runner", () => {
  it("avoids TypeScript-extension imports in checked admin-ai runner files", async () => {
    const files = [
      "scripts/admin-ai-memory/_runner.ts",
      "scripts/admin-ai-memory/backfill.ts",
      "scripts/admin-ai-memory/eval.ts",
      "scripts/admin-ai-memory/_runner.test.ts",
    ];

    for (const relativePath of files) {
      const source = await readFile(resolve(REPO_ROOT, relativePath), "utf8");
      expect(source).not.toMatch(IMPORT_EXTENSION_PATTERN);
    }
  });

  it("can be imported", async () => {
    const mod = await import("./_runner");

    expect(typeof mod.runStandaloneBackfill).toBe("function");
  });
});
