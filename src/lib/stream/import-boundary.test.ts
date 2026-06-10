import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ALLOWED_STREAM_REACT_IMPORTS = new Set([
  "src/components/community/stream-chat-provider.tsx",
  "src/components/community/stream-messages-view.tsx",
]);

const STREAM_CHAT_CSS_IMPORT = 'stream-chat-react/dist/css/index.css';

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) return listSourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry)) return [];
    return [path];
  });
}

describe("Stream import boundaries", () => {
  it("keeps Stream React connection code out of global app surfaces", () => {
    const root = process.cwd();
    const offenders = listSourceFiles(join(root, "src"))
      .map((path) => relative(root, path))
      .filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"))
      .filter((path) => !ALLOWED_STREAM_REACT_IMPORTS.has(path))
      .filter((path) => {
        const source = readFileSync(join(root, path), "utf8");
        return source.includes("stream-chat-react");
      });

    expect(offenders).toEqual([]);
  });

  it("keeps Stream CSS out of the global layout", () => {
    const root = process.cwd();
    const source = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
    const streamImportLines = source
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("stream-chat-react"));

    expect(streamImportLines).toEqual([]);
  });

  it("loads Stream CSS from the community Stream provider", () => {
    const root = process.cwd();
    const source = readFileSync(
      join(root, "src/components/community/stream-chat-provider.tsx"),
      "utf8",
    );

    expect(source).toContain(STREAM_CHAT_CSS_IMPORT);
  });
});
