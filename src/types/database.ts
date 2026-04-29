export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  role: "admin" | "member";
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ApplicationStatus = "reviewing" | "accepted" | "rejected";

export type ProgramSlug = "photography" | "filmmaking" | "freediving" | "internship";

export interface Application {
  id: string;
  user_id: string | null;
  contact_id: string | null;
  program: ProgramSlug;
  status: ApplicationStatus;
  answers: Record<string, unknown>;
  tags: string[];
  admin_notes: AdminNote[];
  submitted_at: string;
  updated_at: string;
}

export type ApplicationSummary = Pick<
  Application,
  "id" | "program" | "status" | "answers" | "submitted_at" | "updated_at"
>;

export interface AdminNote {
  author_id: string;
  author_name: string;
  text: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Contacts & Tags
// ---------------------------------------------------------------------------

export interface Contact {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TagCategory {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
  updated_at: string;
}

export interface TagWithCategory extends Tag {
  category: TagCategory;
}

export interface ContactTag {
  contact_id: string;
  tag_id: string;
  assigned_at: string;
}

export interface ContactNote {
  id: string;
  contact_id: string;
  author_id: string;
  author_name: string;
  text: string;
  created_at: string;
}

export type ContactEventType =
  | "note"
  | "call"
  | "in_person_meeting"
  | "message"
  | "info_requested"
  | "awaiting_btm_response"
  | "custom";

export interface ContactEvent {
  id: string;
  contact_id: string;
  type: ContactEventType;
  custom_label: string | null;
  body: string;
  happened_at: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  author_name: string;
  edited_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Admin Email
// ---------------------------------------------------------------------------

export type EmailCampaignKind = "broadcast" | "outreach" | "one_off";

export type EmailCampaignStatus =
  | "draft"
  | "previewed"
  | "queued"
  | "sending"
  | "sent"
  | "partially_failed"
  | "failed";

export type EmailRecipientStatus =
  | "pending"
  | "skipped_unsubscribed"
  | "skipped_suppressed"
  | "queued"
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed"
  | "replied";

export type EmailEventType =
  | "created"
  | "previewed"
  | "queued"
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed"
  | "unsubscribed"
  | "suppressed"
  | "reply_received"
  | "reply_forwarded"
  | "reply_forward_failed";

export type EmailSuppressionReason =
  | "hard_bounce"
  | "spam_complaint"
  | "invalid_address"
  | "manual"
  | "do_not_contact";

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  status: "draft" | "published" | "archived";
  builder_type: string;
  current_version_id: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplateVersion {
  id: string;
  template_id: string;
  version_number: number;
  subject: string;
  preview_text: string;
  builder_json: Record<string, unknown>;
  mjml: string;
  html: string;
  text: string;
  asset_ids: string[];
  created_by: string;
  created_at: string;
}

export interface EmailAsset {
  id: string;
  storage_path: string;
  public_url: string;
  original_filename: string;
  mime_type: "image/jpeg" | "image/png" | "image/gif";
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_by: string;
  created_at: string;
}

export interface ContactEmailPreference {
  contact_id: string;
  newsletter_unsubscribed_at: string | null;
  newsletter_unsubscribed_source: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface EmailSuppression {
  id: string;
  contact_id: string | null;
  email: string;
  reason: EmailSuppressionReason;
  detail: string;
  provider: string | null;
  provider_event_id: string | null;
  created_by: string | null;
  created_at: string;
  lifted_at: string | null;
  lifted_by: string | null;
}

export interface EmailCampaign {
  id: string;
  kind: EmailCampaignKind;
  status: EmailCampaignStatus;
  name: string;
  subject: string;
  preview_text: string;
  from_email: string;
  from_name: string;
  reply_to_email: string;
  template_version_id: string | null;
  mjml_snapshot: string;
  html_snapshot: string;
  text_snapshot: string;
  created_by: string;
  updated_by: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  recipient_count: number;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  complained_count: number;
  replied_count: number;
  failed_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EmailCampaignRecipient {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  email: string;
  contact_name_snapshot: string;
  personalization_snapshot: Record<string, unknown>;
  status: EmailRecipientStatus;
  provider: string | null;
  provider_message_id: string | null;
  provider_metadata: Record<string, unknown>;
  last_error: string | null;
  queued_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailEvent {
  id: string;
  campaign_id: string | null;
  recipient_id: string | null;
  contact_id: string | null;
  type: EmailEventType;
  provider: string | null;
  provider_event_id: string | null;
  provider_message_id: string | null;
  occurred_at: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface EmailReply {
  id: string;
  campaign_id: string | null;
  recipient_id: string | null;
  contact_id: string | null;
  provider: string;
  provider_message_id: string | null;
  provider_event_id: string | null;
  inbound_to: string;
  inbound_from: string;
  subject: string;
  text_body: string;
  html_body: string;
  body_preview: string;
  attachment_metadata: Record<string, unknown>[];
  forwarded_to: string;
  forwarded_at: string | null;
  forward_status: "pending" | "forwarded" | "failed";
  forward_error: string | null;
  received_at: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Forum
// ---------------------------------------------------------------------------

/** Known seed topics — kept for backwards compat. New topics are dynamic (DB). */
export type ForumTopicSlug = string;

export interface ForumTopic {
  slug: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
}

export interface ForumThread {
  id: string;
  author_id: string | null;
  topic: string | null;
  title: string;
  slug: string;
  reply_count: number;
  pinned: boolean;
  locked: boolean;
  created_at: string;
  updated_at: string;
  last_reply_at: string;
}

export type ForumAuthor = Pick<Profile, "id" | "display_name" | "avatar_url"> | null;

export interface ForumThreadWithAuthor extends ForumThread {
  author: ForumAuthor;
}

export type BodyFormat = "markdown" | "html";

export interface ForumPost {
  id: string;
  thread_id: string;
  author_id: string | null;
  body: string;
  body_format: BodyFormat;
  is_op: boolean;
  body_preview: string;
  like_count: number;
  created_at: string;
  updated_at: string;
}

export interface ForumPostWithAuthor extends ForumPost {
  author: ForumAuthor;
}

export type ForumThreadSummary = Pick<
  ForumThread,
  "id" | "topic" | "title" | "slug" | "reply_count" | "pinned" | "locked" | "created_at" | "last_reply_at"
> & {
  author: ForumAuthor;
  body_preview: string;
  op_post_id: string | null;
  op_body: string;
  op_body_format: BodyFormat;
  op_like_count: number;
  topic_name: string | null;
};

export interface ForumLike {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface ForumLikeWithUser extends ForumLike {
  user: ForumAuthor;
}

// ---------------------------------------------------------------------------
// Application Shares
// ---------------------------------------------------------------------------

export interface ApplicationShare {
  id: string;
  application_id: string;
  token: string;
  created_by: string;
  expires_at: string | null;
  created_at: string;
}

export interface SharedApplicationView {
  application_id: string;
  program: ProgramSlug;
  status: ApplicationStatus;
  answers: Record<string, unknown>;
  submitted_at: string;
  expires_at: string | null;
}

// ---------------------------------------------------------------------------
// Direct Messages
// ---------------------------------------------------------------------------

export interface DmConversation {
  id: string;
  user1_id: string;
  user2_id: string;
  last_message_at: string;
  created_at: string;
}

export interface DmConversationWithParticipant extends DmConversation {
  participant: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
  unread_count: number;
}

export interface DmMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  body_format: "text" | "html";
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DmMessageWithSender extends DmMessage {
  sender: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
}

export interface DmReadReceipt {
  conversation_id: string;
  user_id: string;
  last_read_at: string;
}

export interface OptimisticDmMessage extends DmMessageWithSender {
  _optimistic?: "sending";
}
