import { describe, expect, it } from "vitest";
import { createThreadSchema, createReplySchema, editPostSchema } from "./forum";

describe("createThreadSchema", () => {
  it("accepts valid input", () => {
    const result = createThreadSchema.safeParse({
      topic: "gear-talk",
      title: "Best camera for beginners?",
      body: "I'm looking for recommendations.",
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

describe("editPostSchema", () => {
  it("accepts valid input", () => {
    const result = editPostSchema.safeParse({ body: "Updated body" });
    expect(result.success).toBe(true);
  });

  it("rejects empty body", () => {
    const result = editPostSchema.safeParse({ body: "" });
    expect(result.success).toBe(false);
  });

  it("rejects body over 20,000 chars", () => {
    const result = editPostSchema.safeParse({ body: "a".repeat(20001) });
    expect(result.success).toBe(false);
  });
});
