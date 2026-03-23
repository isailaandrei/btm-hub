export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  role: "admin" | "member";
  created_at: string;
  updated_at: string;
}

export type ApplicationStatus = "reviewing" | "accepted" | "rejected";

export type ProgramSlug = "photography" | "filmmaking" | "freediving" | "internship";

export interface Application {
  id: string;
  user_id: string | null;
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
// Forum
// ---------------------------------------------------------------------------

export type ForumTopicSlug =
  | "trip-reports"
  | "underwater-filmmaking-photography"
  | "gear-talk"
  | "marine-life"
  | "freediving"
  | "beginner-questions";

export interface ForumThread {
  id: string;
  author_id: string | null;
  topic: ForumTopicSlug | null;
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
