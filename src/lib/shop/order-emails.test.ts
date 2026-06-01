import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateAdminClient = vi.fn();
const mockGetEmailProvider = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@/lib/email/provider", () => ({
  getEmailProvider: mockGetEmailProvider,
}));

vi.mock("@/lib/email/settings", () => ({
  getEmailFromEmail: () => "orders@behind-the-mask.com",
  getEmailFromName: () => "Behind The Mask",
  getEmailReplyToEmail: () => "owner@behind-the-mask.com",
}));

const { sendPendingShopOrderNotifications } = await import("./order-emails");

function createNotificationSupabase(notificationData: unknown[]) {
  let operation: "select" | "update" | "insert" = "select";
  const query = {
    select: vi.fn(() => {
      operation = "select";
      return query;
    }),
    update: vi.fn(() => {
      operation = "update";
      return query;
    }),
    insert: vi.fn(() => {
      operation = "insert";
      return query;
    }),
    eq: vi.fn(() => query),
    lt: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: { id: "notification-1" }, error: null }),
    ),
    then: vi.fn((resolve) =>
      resolve(
        operation === "select"
          ? { data: notificationData, error: null }
          : { data: null, error: null },
      ),
    ),
  };

  return {
    from: vi.fn(() => query),
    query,
  };
}

describe("shop order email notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends pending customer notifications through the configured provider", async () => {
    const provider = {
      sendEmail: vi.fn().mockResolvedValue({
        provider: "fake",
        providerMessageId: "message-1",
        raw: {},
      }),
    };
    mockGetEmailProvider.mockReturnValue(provider);
    const supabase = createNotificationSupabase([
      {
        id: "notification-1",
        kind: "customer_confirmation",
        order: {
          id: "order-1",
          order_number: "BTM-1",
          customer_email: "member@example.com",
          total_cents: 7900,
          customer_notes: "",
          items: [
            {
              id: "item-1",
              sort_order: 0,
              quantity: 1,
              product_title: "Mask Tee",
              variant_title: "Black / M",
              line_subtotal_cents: 7900,
            },
          ],
        },
      },
    ]);
    mockCreateAdminClient.mockResolvedValue(supabase);

    const result = await sendPendingShopOrderNotifications();

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(provider.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member@example.com",
        subject: "Order BTM-1 confirmed",
      }),
    );
    expect(supabase.query.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sent" }),
    );
  });

  it("marks notifications failed when no customer recipient exists", async () => {
    const supabase = createNotificationSupabase([
      {
        id: "notification-1",
        kind: "customer_confirmation",
        order: {
          id: "order-1",
          order_number: "BTM-1",
          customer_email: null,
          profile: null,
          total_cents: 7900,
          customer_notes: "",
          items: [],
        },
      },
    ]);
    mockCreateAdminClient.mockResolvedValue(supabase);

    const result = await sendPendingShopOrderNotifications();

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(mockGetEmailProvider).not.toHaveBeenCalled();
    expect(supabase.query.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        last_error: "Order notification has no recipient email.",
      }),
    );
  });
});
