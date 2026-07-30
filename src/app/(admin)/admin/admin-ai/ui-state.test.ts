import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const QUESTION_FORM_PATH =
  "src/app/(admin)/admin/admin-ai/question-form.tsx";
const MESSAGE_LIST_PATH =
  "src/app/(admin)/admin/admin-ai/message-list.tsx";
const PANEL_PATH = "src/app/(admin)/admin/admin-ai/panel.tsx";

describe("admin AI UI states", () => {
  it("renders an explicit thinking spinner while a question is pending", () => {
    const source = readFileSync(QUESTION_FORM_PATH, "utf8");

    expect(source).toContain("Loader2");
    expect(source).toContain('role="status"');
    expect(source).toContain("AI is thinking");
    expect(source).toContain("animate-spin");
  });

  it("uses white foreground surfaces for the AI dialog and assistant messages", () => {
    const messageList = readFileSync(MESSAGE_LIST_PATH, "utf8");
    const panel = readFileSync(PANEL_PATH, "utf8");

    expect(messageList).toContain("bg-white");
    expect(messageList).toContain("shadow-sm");
    expect(panel).toContain("bg-white");
    expect(panel).toContain("shadow-sm");
  });

  // Start-and-poll ask flow (docs/plans/admin-ai-start-and-poll.md): the
  // action returns a "running" placeholder immediately, so the thread view
  // needs its own thinking bubble distinct from the ask box's pending pill.
  it("renders a running-message bubble with a spinner in the message list", () => {
    const source = readFileSync(MESSAGE_LIST_PATH, "utf8");

    expect(source).toContain("Loader2");
    expect(source).toContain('role="status"');
    expect(source).toContain("Analyzing —");
    expect(source).toContain("animate-spin");
  });

  it("surfaces the client-side stall guard after 8 minutes of awaiting", () => {
    const source = readFileSync(QUESTION_FORM_PATH, "utf8");

    expect(source).toContain("Still running after 8 minutes");
  });
});
