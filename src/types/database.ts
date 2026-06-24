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

export type AdminAssigneeProfile = Pick<
  Profile,
  | "id"
  | "email"
  | "display_name"
  | "avatar_url"
  | "role"
  | "created_at"
  | "updated_at"
>;

export type PortfolioImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface ProfilePortfolioItem {
  id: string;
  profile_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: PortfolioImageMimeType;
  size_bytes: number;
  title: string | null;
  caption: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProfilePortfolioItemWithUrl extends ProfilePortfolioItem {
  signedUrl: string | null;
  thumbnailUrl: string | null;
  imageError: string | null;
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
  | "tag_assigned"
  | "tag_removed"
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
// Admin Tasks
// ---------------------------------------------------------------------------

export type TaskStatus =
  | "not_started"
  | "working_on_it"
  | "waiting"
  | "done";

export type TaskPriority = "low" | "normal" | "high" | "critical";

export type TaskGroupColor =
  | "blue"
  | "teal"
  | "green"
  | "amber"
  | "orange"
  | "red"
  | "pink"
  | "purple"
  | "slate";

export interface TaskGroup {
  id: string;
  name: string;
  color: TaskGroupColor;
  sort_order: number;
  archived_at: string | null;
  archived_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminTask {
  id: string;
  group_id: string;
  title: string;
  description: string;
  assignee_id: string | null;
  due_date: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  sort_order: number;
  completed_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Admin Email
// ---------------------------------------------------------------------------

export type EmailSendKind = "broadcast" | "outreach";

export type EmailTemplateStatus = "draft" | "published" | "archived";

export type EmailSendStatus =
  | "draft"
  | "queued"
  | "sending"
  | "sent"
  | "partially_failed"
  | "failed";

export type EmailRecipientStatus =
  | "pending"
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "clicked"
  | "deferred"
  | "bounced"
  | "complained"
  | "failed"
  | "skipped_unsubscribed"
  | "skipped_suppressed"
  | "unsubscribed";

export type EmailEventType =
  | "created"
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed"
  | "unsubscribed"
  | "suppressed";

export type EmailSuppressionReason =
  | "hard_bounce"
  | "spam_complaint"
  | "invalid_address"
  | "manual"
  | "do_not_contact"
  | "unsubscribe";

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  status: EmailTemplateStatus;
  builder_type: "maily";
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
  builder_json: Record<string, unknown>;
  html: string;
  text: string;
  asset_ids: string[];
  content_hash: string | null;
  created_by: string;
  created_at: string;
}

export interface EmailAsset {
  id: string;
  storage_path: string;
  public_url: string;
  original_filename: string;
  mime_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_by: string;
  created_at: string;
}

export interface EmailManualRecipient {
  id: string;
  email: string;
  name: string;
  notes: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface EmailList {
  id: string;
  name: string;
  description: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface EmailListMember {
  id: string;
  list_id: string;
  contact_id: string | null;
  manual_recipient_id: string | null;
  email: string;
  added_at: string;
}

export interface EmailSegmentRule {
  match: "all" | "any";
  includeTagIds: string[];
  excludeTagIds: string[];
}

export interface EmailSegment {
  id: string;
  name: string;
  description: string;
  rule: EmailSegmentRule;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
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

export interface EmailSend {
  id: string;
  kind: EmailSendKind;
  status: EmailSendStatus;
  name: string;
  subject_template: string;
  preview_text: string;
  from_email: string;
  from_name: string;
  reply_to_email: string;
  template_version_id: string | null;
  /** Unguessable token for the public "View in browser" web version of this send. */
  public_token: string;
  builder_json_snapshot: Record<string, unknown>;
  html_preview_snapshot: string;
  text_preview_snapshot: string;
  created_by: string;
  updated_by: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  recipient_count: number;
  skipped_count: number;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  complained_count: number;
  failed_count: number;
  deferred_count: number;
  unsubscribed_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EmailSendRecipient {
  id: string;
  send_id: string;
  contact_id: string | null;
  email: string;
  contact_name_snapshot: string;
  personalization_snapshot: Record<string, unknown>;
  status: EmailRecipientStatus;
  skip_reason: string | null;
  rendered_subject: string | null;
  rendered_html: string | null;
  rendered_text: string | null;
  unsubscribe_token_hash: string | null;
  provider: string | null;
  provider_message_id: string | null;
  provider_metadata: Record<string, unknown>;
  send_attempts: number;
  last_error: string | null;
  queued_at: string | null;
  sending_started_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  deferred_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailEvent {
  id: string;
  send_id: string | null;
  recipient_id: string | null;
  contact_id: string | null;
  type: EmailEventType;
  provider: string | null;
  provider_event_id: string | null;
  provider_message_id: string | null;
  event_fingerprint: string;
  occurred_at: string;
  payload: Record<string, unknown>;
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
// Notifications
// ---------------------------------------------------------------------------

export type NotificationType = "stream_message";
export type NotificationEntityType = "stream_message";

export interface Notification {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  entity_type: NotificationEntityType;
  entity_id: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationWithActor extends Notification {
  actor: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
}

// ---------------------------------------------------------------------------
// Chat Provider Registry
// ---------------------------------------------------------------------------

export type ChatThreadKind = "direct";
export type ChatProvider = "stream";

export interface ChatThread {
  id: string;
  kind: ChatThreadKind;
  provider: ChatProvider;
  provider_channel_id: string;
  provider_channel_cid: string;
  direct_participant_key: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatThreadParticipant {
  thread_id: string;
  profile_id: string;
  created_at: string;
}
