import { describe, expect, it } from "vitest";
import { createThreadSchema, createReplySchema, editThreadSchema, editReplySchema } from "./forum";

describe("createThreadSchema", () => {
  it("accepts valid input", () => {
    const result = createThreadSchema.safeParse({
      topic: "gear-talk",
      title: "Best camera for beginners?",
      body: "I'm looking for recommendations.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input without topic", () => {
    const result = createThreadSchema.safeParse({
      title: "No topic post",
      body: "Body text here.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid topic", () => {
    const result = createThreadSchema.safeParse({
      topic: "invalid-topic",
      title: "Test",
      body: "Body",
    });
    expect(result.success).toBe(false);
  });

  it("accepts bodyFormat html", () => {
    const result = createThreadSchema.safeParse({
      title: "TipTap post",
      body: "<p>Hello</p>",
      bodyFormat: "html",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bodyFormat).toBe("html");
    }
  });

  it("defaults bodyFormat to markdown", () => {
    const result = createThreadSchema.safeParse({
      topic: "gear-talk",
      title: "Markdown post",
      body: "# Hello",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bodyFormat).toBe("markdown");
    }
  });

  it("rejects title shorter than 3 chars", () => {
    const result = createThreadSchema.safeParse({
      topic: "gear-talk",
      title: "Hi",
      body: "Body text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects title longer than 200 chars", () => {
    const result = createThreadSchema.safeParse({
      topic: "gear-talk",
      title: "a".repeat(201),
      body: "Body text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty body", () => {
    const result = createThreadSchema.safeParse({
      topic: "gear-talk",
      title: "Valid title",
      body: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects body over 20,000 chars", () => {
    const result = createThreadSchema.safeParse({
      topic: "gear-talk",
      title: "Valid title",
      body: "a".repeat(20001),
    });
    expect(result.success).toBe(false);
  });
});

describe("createReplySchema", () => {
  it("accepts valid input", () => {
    const result = createReplySchema.safeParse({
      threadId: "550e8400-e29b-41d4-a716-446655440000",
      body: "Great thread!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID", () => {
    const result = createReplySchema.safeParse({
      threadId: "not-a-uuid",
      body: "Great thread!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty body", () => {
    const result = createReplySchema.safeParse({
      threadId: "550e8400-e29b-41d4-a716-446655440000",
      body: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects body over 10,000 chars", () => {
    const result = createReplySchema.safeParse({
      threadId: "550e8400-e29b-41d4-a716-446655440000",
      body: "a".repeat(10001),
    });
    expect(result.success).toBe(false);
  });
});

describe("editThreadSchema", () => {
  it("accepts valid input", () => {
    const result = editThreadSchema.safeParse({ body: "Updated body" });
    expect(result.success).toBe(true);
  });

  it("rejects empty body", () => {
    const result = editThreadSchema.safeParse({ body: "" });
    expect(result.success).toBe(false);
  });

  it("rejects body over 20,000 chars", () => {
    const result = editThreadSchema.safeParse({ body: "a".repeat(20001) });
    expect(result.success).toBe(false);
  });
});

describe("editReplySchema", () => {
  it("accepts valid input", () => {
    const result = editReplySchema.safeParse({ body: "Updated reply" });
    expect(result.success).toBe(true);
  });

  it("rejects empty body", () => {
    const result = editReplySchema.safeParse({ body: "" });
    expect(result.success).toBe(false);
  });

  it("rejects body over 10,000 chars", () => {
    const result = editReplySchema.safeParse({ body: "a".repeat(10001) });
    expect(result.success).toBe(false);
  });

  it("accepts body at exactly 10,000 chars", () => {
    const result = editReplySchema.safeParse({ body: "a".repeat(10000) });
    expect(result.success).toBe(true);
  });
});
