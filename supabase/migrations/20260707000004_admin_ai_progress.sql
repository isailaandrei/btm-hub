-- Live stage progress for long-running admin-AI answers (map-reduce global
-- answers run 15-110s). The ask action writes tiny fire-and-forget snapshots
-- keyed by a client-generated progress id; the client polls while awaiting
-- the answer. Rows are deleted when the answer resolves — the table is
-- ephemeral by design (a handful of rows, ever).
--
-- Written and read exclusively through the service-role client behind
-- requireAdmin() actions, so RLS is enabled with NO policies and nothing is
-- granted to authenticated.

CREATE TABLE admin_ai_progress (
  id uuid PRIMARY KEY,
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_ai_progress ENABLE ROW LEVEL SECURITY;
