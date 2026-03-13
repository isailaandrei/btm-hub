export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export type ApplicationStatus = "reviewing" | "accepted";

export type ProgramSlug = "photography" | "filmmaking" | "freediving" | "modelling" | "internship";

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

export interface AdminNote {
  author_id: string;
  author_name: string;
  text: string;
  created_at: string;
}

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
  program: string;
  status: string;
  answers: Record<string, unknown>;
  submitted_at: string;
  expires_at: string | null;
}