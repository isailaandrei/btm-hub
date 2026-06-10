import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT_LAYOUT_PATH = "src/app/layout.tsx";
const GLOBAL_CSS_PATH = "src/app/globals.css";
const STREAM_PROVIDER_PATH = "src/components/community/stream-chat-provider.tsx";
const STREAM_CHAT_CSS_IMPORT = 'stream-chat-react/dist/css/index.css';
const LOCAL_STREAM_CHAT_CSS_IMPORT = './stream-chat.css';

describe("Stream Chat CSS scoping", () => {
  it("keeps Stream Chat package CSS out of the root layout", () => {
    const rootLayout = readFileSync(ROOT_LAYOUT_PATH, "utf8");
    expect(rootLayout).not.toContain(STREAM_CHAT_CSS_IMPORT);
  });

  it("keeps Stream Chat selectors out of global CSS", () => {
    const globalCss = readFileSync(GLOBAL_CSS_PATH, "utf8");
    expect(globalCss).not.toContain("str-chat");
    expect(globalCss).not.toContain("stream-chat-shell");
  });

  it("loads Stream Chat package CSS with the Stream provider", () => {
    const streamProvider = readFileSync(STREAM_PROVIDER_PATH, "utf8");
    expect(streamProvider).toContain(STREAM_CHAT_CSS_IMPORT);
    expect(streamProvider).toContain(LOCAL_STREAM_CHAT_CSS_IMPORT);
  });
});
