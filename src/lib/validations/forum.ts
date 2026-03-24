import { z } from "zod/v4";

const bodyFormatSchema = z.enum(["markdown", "html"]).default("markdown");

export const createThreadSchema = z.object({
  topic: z.string().min(1).optional(),
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be under 200 characters"),
  body: z
    .string()
    .min(1, "Body is required")
    .max(20000, "Body must be under 20,000 characters"),
  bodyFormat: bodyFormatSchema,
});

export const createReplySchema = z.object({
  threadId: z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid thread ID",
  ),
  body: z
    .string()
    .min(1, "Reply is required")
    .max(10000, "Reply must be under 10,000 characters"),
  bodyFormat: bodyFormatSchema,
});

export const editThreadSchema = z.object({
  body: z
    .string()
    .min(1, "Body is required")
    .max(20000, "Body must be under 20,000 characters"),
  bodyFormat: bodyFormatSchema,
});

export const editReplySchema = z.object({
  body: z
    .string()
    .min(1, "Body is required")
    .max(10000, "Reply must be under 10,000 characters"),
  bodyFormat: bodyFormatSchema,
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type CreateReplyInput = z.infer<typeof createReplySchema>;
export type EditThreadInput = z.infer<typeof editThreadSchema>;
export type EditReplyInput = z.infer<typeof editReplySchema>;
