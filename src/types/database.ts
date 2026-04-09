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
}

export interface Tag {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
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
