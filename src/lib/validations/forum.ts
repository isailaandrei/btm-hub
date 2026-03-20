import { z } from "zod/v4";
import { FORUM_TOPIC_SLUGS } from "@/lib/community/topics";

export const createThreadSchema = z.object({
  topic: z.enum(FORUM_TOPIC_SLUGS),
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be under 200 characters"),
  body: z
    .string()
    .min(1, "Body is required")
    .max(20000, "Body must be under 20,000 characters"),
});

export const createReplySchema = z.object({
  threadId: z.uuid("Invalid thread ID"),
  body: z
    .string()
    .min(1, "Reply is required")
    .max(10000, "Reply must be under 10,000 characters"),
});

export const editPostSchema = z.object({
  body: z
    .string()
    .min(1, "Body is required")
    .max(20000, "Body must be under 20,000 characters"),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type CreateReplyInput = z.infer<typeof createReplySchema>;
export type EditPostInput = z.infer<typeof editPostSchema>;
