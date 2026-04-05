import { z } from "zod/v4";

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid("Invalid conversation ID"),
  body: z
    .string()
    .min(1, "Message is required")
    .max(5000, "Message must be under 5,000 characters"),
  bodyFormat: z.enum(["text", "html"]).default("html"),
});

export const editMessageSchema = z.object({
  messageId: z.string().uuid("Invalid message ID"),
  body: z
    .string()
    .min(1, "Message is required")
    .max(5000, "Message must be under 5,000 characters"),
  bodyFormat: z.enum(["text", "html"]).default("html"),
});

export const startConversationSchema = z.object({
  recipientId: z.string().uuid("Invalid user ID"),
});
