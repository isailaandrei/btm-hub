import {
  getEmailFromEmail,
  getEmailFromName,
  getEmailReplyToEmail,
} from "@/lib/email/settings";
import { getEmailProvider } from "@/lib/email/provider";
import { formatEuroCents } from "@/lib/shop/money";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ShopOrder,
  ShopOrderItem,
  ShopOrderNotificationKind,
} from "@/types/database";

interface PendingOrderNotification {
  id: string;
  kind: ShopOrderNotificationKind;
  order: ShopOrder & {
    items: ShopOrderItem[];
    profile?: { email: string; display_name: string | null } | null;
  };
}

const STALE_SENDING_MS = 15 * 60 * 1000;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function orderLines(order: PendingOrderNotification["order"]) {
  return [...(order.items ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(
      (item) =>
        `${item.quantity}x ${item.product_title} - ${item.variant_title} (${formatEuroCents(item.line_subtotal_cents)})`,
    );
}

function renderOrderEmail(input: {
  kind: ShopOrderNotificationKind;
  order: PendingOrderNotification["order"];
}) {
  const lines = orderLines(input.order);
  const subject =
    input.kind === "customer_confirmation"
      ? `Order ${input.order.order_number} confirmed`
      : `New shop order ${input.order.order_number}`;

  const htmlLines = lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  const html = `
    <div>
      <h1>${escapeHtml(subject)}</h1>
      <p>Total: ${escapeHtml(formatEuroCents(input.order.total_cents))}</p>
      <ul>${htmlLines}</ul>
      ${
        input.order.customer_notes
          ? `<p>Notes: ${escapeHtml(input.order.customer_notes)}</p>`
          : ""
      }
    </div>
  `;
  const text = [
    subject,
    `Total: ${formatEuroCents(input.order.total_cents)}`,
    ...lines,
    input.order.customer_notes ? `Notes: ${input.order.customer_notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

async function markNotification(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  id: string,
  input: {
    status: "sending" | "sent" | "failed";
    lastError?: string | null;
  },
) {
  const { error } = await supabase
    .from("shop_order_notifications")
    .update({
      status: input.status,
      last_error: input.lastError ?? null,
      sent_at: input.status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) throw new Error(`Failed to update order notification: ${error.message}`);
}

async function releaseStaleSendingNotifications(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
) {
  const staleBefore = new Date(Date.now() - STALE_SENDING_MS).toISOString();
  const { error } = await supabase
    .from("shop_order_notifications")
    .update({
      status: "pending",
      last_error: "Reset stale sending notification.",
    })
    .eq("status", "sending")
    .lt("updated_at", staleBefore);

  if (error) {
    throw new Error(`Failed to release stale order notifications: ${error.message}`);
  }
}

async function claimNotification(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  id: string,
) {
  const { data, error } = await supabase
    .from("shop_order_notifications")
    .update({
      status: "sending",
      last_error: null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Failed to claim order notification: ${error.message}`);
  return Boolean(data);
}

async function recordEmailEvent(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  orderId: string,
  input: {
    type: "email_sent" | "email_failed";
    message: string;
    payload: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from("shop_order_events").insert({
    order_id: orderId,
    type: input.type,
    message: input.message,
    payload: input.payload,
    customer_visible: false,
  });
  if (error) throw new Error(`Failed to record order email event: ${error.message}`);
}

function notificationRecipient(notification: PendingOrderNotification) {
  if (notification.kind === "internal_alert") {
    return getEmailReplyToEmail();
  }

  return (
    notification.order.customer_email ||
    notification.order.profile?.email ||
    null
  );
}

export async function sendPendingShopOrderNotifications({
  limit = 10,
}: {
  limit?: number;
} = {}) {
  const supabase = await createAdminClient();
  await releaseStaleSendingNotifications(supabase);
  const { data, error } = await supabase
    .from("shop_order_notifications")
    .select(`
      id,
      kind,
      order:shop_orders(
        *,
        profile:profiles(email, display_name),
        items:shop_order_items(*)
      )
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to load order notifications: ${error.message}`);

  const notifications = (data ?? []) as unknown as PendingOrderNotification[];
  if (notifications.length === 0) return { sent: 0, failed: 0 };

  let provider: ReturnType<typeof getEmailProvider> | null = null;
  let sent = 0;
  let failed = 0;

  for (const notification of notifications) {
    const recipient = notificationRecipient(notification);
    try {
      const claimed = await claimNotification(supabase, notification.id);
      if (!claimed) continue;
      if (!recipient) throw new Error("Order notification has no recipient email.");
      provider ??= getEmailProvider();
      const email = renderOrderEmail({
        kind: notification.kind,
        order: notification.order,
      });
      const result = await provider.sendEmail({
        recipientId: `${notification.order.id}:${notification.kind}`,
        sendId: notification.id,
        contactId: null,
        to: recipient,
        fromEmail: getEmailFromEmail(),
        fromName: getEmailFromName(),
        replyTo: getEmailReplyToEmail(),
        subject: email.subject,
        html: email.html,
        text: email.text,
        metadata: {
          source: "shop_orders",
          orderId: notification.order.id,
          notificationKind: notification.kind,
        },
      });

      await markNotification(supabase, notification.id, { status: "sent" });
      await recordEmailEvent(supabase, notification.order.id, {
        type: "email_sent",
        message: `Order ${notification.kind} email sent.`,
        payload: {
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          notificationId: notification.id,
        },
      });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email failed.";
      await markNotification(supabase, notification.id, {
        status: "failed",
        lastError: message,
      });
      await recordEmailEvent(supabase, notification.order.id, {
        type: "email_failed",
        message: `Order ${notification.kind} email failed.`,
        payload: { error: message, notificationId: notification.id },
      });
      failed += 1;
    }
  }

  return { sent, failed };
}
