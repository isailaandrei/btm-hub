-- Admin Tasks board.
-- Also hardens profile role writes because task RPC auth depends on profiles.role.

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('member', 'admin')) NOT VALID;

ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_role_check;

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;

GRANT SELECT ON TABLE public.profiles TO anon, authenticated;
GRANT INSERT (id, email, display_name, avatar_url, bio, preferences)
  ON public.profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url, bio, preferences, updated_at)
  ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND role = 'member'
  );

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE public.task_status AS ENUM (
      'not_started',
      'working_on_it',
      'waiting',
      'done'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE public.task_priority AS ENUM (
      'low',
      'normal',
      'high',
      'critical'
    );
  END IF;
END
$$;

CREATE TABLE public.task_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  color text NOT NULL CHECK (color IN ('blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'purple', 'slate')),
  sort_order integer NOT NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.task_groups(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date date,
  status public.task_status NOT NULL DEFAULT 'not_started',
  priority public.task_priority NOT NULL DEFAULT 'normal',
  sort_order integer NOT NULL,
  completed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'done' AND completed_at IS NOT NULL) OR (status <> 'done' AND completed_at IS NULL))
);

CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 3000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_groups_active_order
  ON public.task_groups (archived_at, sort_order, created_at);

CREATE INDEX idx_tasks_group_order
  ON public.tasks (group_id, archived_at, status, sort_order, created_at);

CREATE INDEX idx_tasks_due_date
  ON public.tasks (due_date, status)
  WHERE archived_at IS NULL;

CREATE INDEX idx_tasks_assignee_due
  ON public.tasks (assignee_id, due_date)
  WHERE archived_at IS NULL;

CREATE INDEX idx_tasks_completed_group
  ON public.tasks (group_id, completed_at DESC, id DESC)
  WHERE archived_at IS NULL AND status = 'done';

CREATE INDEX idx_tasks_completed_due
  ON public.tasks (due_date, completed_at DESC, id DESC)
  WHERE archived_at IS NULL AND status = 'done';

CREATE UNIQUE INDEX uniq_task_groups_active_sort_order
  ON public.task_groups (sort_order)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX uniq_tasks_active_group_sort_order
  ON public.tasks (group_id, sort_order)
  WHERE archived_at IS NULL AND status <> 'done';

CREATE INDEX idx_task_comments_task_created
  ON public.task_comments (task_id, created_at);

ALTER TABLE public.task_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read task_groups" ON public.task_groups
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- Admins can read archived task rows as well. The application queries still filter
-- active tasks, but Realtime must be allowed to deliver archive UPDATE events.
CREATE POLICY "Admins can read tasks" ON public.tasks
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can read task_comments" ON public.task_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
    AND EXISTS (
      SELECT 1
      FROM public.tasks t
      INNER JOIN public.task_groups g ON g.id = t.group_id
      WHERE t.id = task_comments.task_id
        AND t.archived_at IS NULL
        AND g.archived_at IS NULL
    )
  );

REVOKE ALL ON TABLE public.task_groups FROM anon, authenticated;
REVOKE ALL ON TABLE public.tasks FROM anon, authenticated;
REVOKE ALL ON TABLE public.task_comments FROM anon, authenticated;
GRANT SELECT ON TABLE public.task_groups TO authenticated;
GRANT SELECT ON TABLE public.tasks TO authenticated;
GRANT SELECT ON TABLE public.task_comments TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.task_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
ALTER TABLE public.task_groups REPLICA IDENTITY FULL;
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.task_comments REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.assert_admin()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_no_duplicate_ids(p_ids uuid[], p_label text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (
    SELECT count(*) FROM unnest(COALESCE(p_ids, ARRAY[]::uuid[])) AS id
  ) <> (
    SELECT count(DISTINCT id) FROM unnest(COALESCE(p_ids, ARRAY[]::uuid[])) AS id
  ) THEN
    RAISE EXCEPTION 'Duplicate % IDs in reorder payload', p_label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_task_group(
  p_name text,
  p_color text
)
RETURNS public.task_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid := public.assert_admin();
  v_group public.task_groups;
  v_name text := btrim(COALESCE(p_name, ''));
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('admin_tasks:groups'));

  IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Task group name must be 1-80 characters';
  END IF;

  INSERT INTO public.task_groups (name, color, sort_order, created_by, updated_by)
  SELECT
    v_name,
    p_color,
    COALESCE(max(sort_order), 0) + 1000,
    v_admin_id,
    v_admin_id
  FROM public.task_groups
  WHERE archived_at IS NULL
  RETURNING * INTO v_group;

  RETURN v_group;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_task_group(
  p_group_id uuid,
  p_name text DEFAULT NULL,
  p_color text DEFAULT NULL
)
RETURNS public.task_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid := public.assert_admin();
  v_group public.task_groups;
  v_name text := CASE WHEN p_name IS NULL THEN NULL ELSE btrim(p_name) END;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_tasks:group:' || p_group_id::text, 0));

  IF p_name IS NOT NULL AND char_length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Task group name must be 1-80 characters';
  END IF;

  UPDATE public.task_groups
  SET name = COALESCE(v_name, name),
      color = COALESCE(p_color, color),
      updated_at = now(),
      updated_by = v_admin_id
  WHERE id = p_group_id
    AND archived_at IS NULL
  RETURNING * INTO v_group;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task group not found';
  END IF;

  RETURN v_group;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_task(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_assignee_id uuid,
  p_due_date date,
  p_status public.task_status,
  p_priority public.task_priority
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid := public.assert_admin();
  v_task public.tasks;
  v_title text := btrim(COALESCE(p_title, ''));
  v_description text := COALESCE(p_description, '');
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_tasks:group:' || p_group_id::text, 0));

  PERFORM 1
  FROM public.task_groups
  WHERE id = p_group_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task group not found';
  END IF;

  IF char_length(v_title) NOT BETWEEN 1 AND 180 THEN
    RAISE EXCEPTION 'Task title must be 1-180 characters';
  END IF;

  IF char_length(v_description) > 5000 THEN
    RAISE EXCEPTION 'Task notes must be 5000 characters or fewer';
  END IF;

  IF p_assignee_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_assignee_id AND role = 'admin'
    ) THEN
    RAISE EXCEPTION 'Task assignee must be an admin';
  END IF;

  INSERT INTO public.tasks (
    group_id, title, description, assignee_id, due_date,
    status, priority, sort_order, completed_at, created_by, updated_by
  )
  SELECT
    p_group_id,
    v_title,
    v_description,
    p_assignee_id,
    p_due_date,
    p_status,
    p_priority,
    CASE WHEN p_status = 'done' THEN -1 ELSE COALESCE(max(sort_order), 0) + 1000 END,
    CASE WHEN p_status = 'done' THEN now() ELSE NULL END,
    v_admin_id,
    v_admin_id
  FROM public.tasks
  WHERE group_id = p_group_id
    AND archived_at IS NULL
    AND status <> 'done'
  RETURNING * INTO v_task;

  RETURN v_task;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_task(
  p_task_id uuid,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_assignee_id uuid DEFAULT NULL,
  p_clear_assignee boolean DEFAULT false,
  p_due_date date DEFAULT NULL,
  p_clear_due_date boolean DEFAULT false,
  p_status public.task_status DEFAULT NULL,
  p_priority public.task_priority DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid := public.assert_admin();
  v_task public.tasks;
  v_next_status public.task_status;
  v_title text := CASE WHEN p_title IS NULL THEN NULL ELSE btrim(p_title) END;
  v_description text := p_description;
  v_next_sort_order integer;
  v_group_id uuid;
BEGIN
  SELECT group_id INTO v_group_id
  FROM public.tasks
  WHERE id = p_task_id
    AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('admin_tasks:group:' || v_group_id::text, 0));

  SELECT * INTO v_task
  FROM public.tasks
  WHERE id = p_task_id
    AND group_id = v_group_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  PERFORM 1
  FROM public.task_groups
  WHERE id = v_group_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task group not found';
  END IF;

  IF p_title IS NOT NULL AND char_length(v_title) NOT BETWEEN 1 AND 180 THEN
    RAISE EXCEPTION 'Task title must be 1-180 characters';
  END IF;

  IF p_description IS NOT NULL AND char_length(v_description) > 5000 THEN
    RAISE EXCEPTION 'Task notes must be 5000 characters or fewer';
  END IF;

  IF p_assignee_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_assignee_id AND role = 'admin'
    ) THEN
    RAISE EXCEPTION 'Task assignee must be an admin';
  END IF;

  v_next_status := COALESCE(p_status, v_task.status);

  IF v_task.status = 'done' AND v_next_status <> 'done' THEN
    SELECT COALESCE(max(sort_order), 0) + 1000 INTO v_next_sort_order
    FROM public.tasks
    WHERE group_id = v_group_id
      AND archived_at IS NULL
      AND status <> 'done';
  END IF;

  UPDATE public.tasks
  SET title = COALESCE(v_title, title),
      description = COALESCE(v_description, description),
      assignee_id = CASE
        WHEN p_clear_assignee THEN NULL
        WHEN p_assignee_id IS NOT NULL THEN p_assignee_id
        ELSE assignee_id
      END,
      due_date = CASE
        WHEN p_clear_due_date THEN NULL
        WHEN p_due_date IS NOT NULL THEN p_due_date
        ELSE due_date
      END,
      status = v_next_status,
      priority = COALESCE(p_priority, priority),
      sort_order = COALESCE(v_next_sort_order, sort_order),
      completed_at = CASE
        WHEN v_next_status = 'done' AND v_task.status <> 'done' THEN now()
        WHEN v_next_status = 'done' AND v_task.status = 'done' THEN v_task.completed_at
        ELSE NULL
      END,
      updated_by = v_admin_id,
      updated_at = now()
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  RETURN v_task;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_task_comment(
  p_task_id uuid,
  p_body text
)
RETURNS public.task_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid := public.assert_admin();
  v_author_name text;
  v_comment public.task_comments;
  v_body text := btrim(COALESCE(p_body, ''));
  v_group_id uuid;
BEGIN
  IF char_length(v_body) NOT BETWEEN 1 AND 3000 THEN
    RAISE EXCEPTION 'Task comment must be 1-3000 characters';
  END IF;

  SELECT t.group_id INTO v_group_id
  FROM public.tasks t
  INNER JOIN public.task_groups g ON g.id = t.group_id
  WHERE t.id = p_task_id
    AND t.archived_at IS NULL
    AND g.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('admin_tasks:group:' || v_group_id::text, 0));

  SELECT t.group_id INTO v_group_id
  FROM public.tasks t
  INNER JOIN public.task_groups g ON g.id = t.group_id
  WHERE t.id = p_task_id
    AND t.group_id = v_group_id
    AND t.archived_at IS NULL
    AND g.archived_at IS NULL
  FOR UPDATE OF t, g;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  SELECT COALESCE(display_name, email) INTO v_author_name
  FROM public.profiles
  WHERE id = v_admin_id;

  INSERT INTO public.task_comments (task_id, author_id, author_name, body)
  VALUES (p_task_id, v_admin_id, v_author_name, v_body)
  RETURNING * INTO v_comment;

  RETURN v_comment;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_task(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid := public.assert_admin();
  v_archived_at timestamptz := now();
  v_group_id uuid;
BEGIN
  SELECT t.group_id INTO v_group_id
  FROM public.tasks t
  INNER JOIN public.task_groups g ON g.id = t.group_id
  WHERE t.id = p_task_id
    AND t.archived_at IS NULL
    AND g.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('admin_tasks:group:' || v_group_id::text, 0));

  SELECT t.group_id INTO v_group_id
  FROM public.tasks t
  INNER JOIN public.task_groups g ON g.id = t.group_id
  WHERE t.id = p_task_id
    AND t.group_id = v_group_id
    AND t.archived_at IS NULL
    AND g.archived_at IS NULL
  FOR UPDATE OF t, g;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  UPDATE public.tasks
  SET archived_at = v_archived_at,
      archived_by = v_admin_id,
      updated_at = v_archived_at,
      updated_by = v_admin_id
  WHERE id = p_task_id
    AND archived_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_task_groups(p_group_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected_count integer;
  v_actual_count integer;
BEGIN
  PERFORM public.assert_admin();
  PERFORM public.assert_no_duplicate_ids(p_group_ids, 'task group');
  PERFORM pg_advisory_xact_lock(hashtext('admin_tasks:groups'));

  PERFORM 1
  FROM public.task_groups
  WHERE archived_at IS NULL
  FOR UPDATE;

  SELECT count(*) INTO v_expected_count
  FROM unnest(COALESCE(p_group_ids, ARRAY[]::uuid[]));

  SELECT count(*) INTO v_actual_count
  FROM public.task_groups
  WHERE archived_at IS NULL;

  IF v_expected_count <> v_actual_count THEN
    RAISE EXCEPTION 'Task group reorder payload must include every active group';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_group_ids, ARRAY[]::uuid[])) AS supplied(id)
    LEFT JOIN public.task_groups g ON g.id = supplied.id AND g.archived_at IS NULL
    WHERE g.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Invalid task group reorder payload';
  END IF;

  UPDATE public.task_groups g
  SET sort_order = -1000000 - ordered.ordinal,
      updated_at = now(),
      updated_by = auth.uid()
  FROM (
    SELECT id, ordinal
    FROM unnest(COALESCE(p_group_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS supplied(id, ordinal)
  ) ordered
  WHERE g.id = ordered.id;

  UPDATE public.task_groups g
  SET sort_order = ordered.ordinal * 1000,
      updated_at = now(),
      updated_by = auth.uid()
  FROM (
    SELECT id, ordinal
    FROM unnest(COALESCE(p_group_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS supplied(id, ordinal)
  ) ordered
  WHERE g.id = ordered.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_active_tasks(p_group_id uuid, p_task_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected_count integer;
  v_actual_count integer;
BEGIN
  PERFORM public.assert_admin();
  PERFORM public.assert_no_duplicate_ids(p_task_ids, 'task');
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_tasks:group:' || p_group_id::text, 0));

  PERFORM 1
  FROM public.task_groups
  WHERE id = p_group_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task group not found';
  END IF;

  PERFORM 1
  FROM public.tasks
  WHERE group_id = p_group_id
    AND status <> 'done'
    AND archived_at IS NULL
  FOR UPDATE;

  SELECT count(*) INTO v_expected_count
  FROM unnest(COALESCE(p_task_ids, ARRAY[]::uuid[]));

  SELECT count(*) INTO v_actual_count
  FROM public.tasks
  WHERE group_id = p_group_id
    AND status <> 'done'
    AND archived_at IS NULL;

  IF v_expected_count <> v_actual_count THEN
    RAISE EXCEPTION 'Task reorder payload must include every active non-done task in the group';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_task_ids, ARRAY[]::uuid[])) AS supplied(id)
    LEFT JOIN public.tasks t
      ON t.id = supplied.id
     AND t.group_id = p_group_id
     AND t.archived_at IS NULL
     AND t.status <> 'done'
    WHERE t.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Invalid task reorder payload';
  END IF;

  UPDATE public.tasks t
  SET sort_order = -1000000 - ordered.ordinal,
      updated_at = now(),
      updated_by = auth.uid()
  FROM (
    SELECT id, ordinal
    FROM unnest(COALESCE(p_task_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS supplied(id, ordinal)
  ) ordered
  WHERE t.id = ordered.id;

  UPDATE public.tasks t
  SET sort_order = ordered.ordinal * 1000,
      updated_at = now(),
      updated_by = auth.uid()
  FROM (
    SELECT id, ordinal
    FROM unnest(COALESCE(p_task_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS supplied(id, ordinal)
  ) ordered
  WHERE t.id = ordered.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_active_task_to_group(
  p_task_id uuid,
  p_target_group_id uuid,
  p_target_task_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid := public.assert_admin();
  v_source_group_id uuid;
  v_lock_group_id uuid;
BEGIN
  SELECT group_id INTO v_source_group_id
  FROM public.tasks
  WHERE id = p_task_id
    AND archived_at IS NULL
    AND status <> 'done';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active task not found';
  END IF;

  FOR v_lock_group_id IN
    SELECT id
    FROM (
      SELECT v_source_group_id AS id
      UNION
      SELECT p_target_group_id AS id
    ) locked_groups
    ORDER BY id::text
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('admin_tasks:group:' || v_lock_group_id::text, 0));
  END LOOP;

  SELECT group_id INTO v_source_group_id
  FROM public.tasks
  WHERE id = p_task_id
    AND group_id = v_source_group_id
    AND archived_at IS NULL
    AND status <> 'done'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active task not found';
  END IF;

  PERFORM 1
  FROM public.task_groups
  WHERE id IN (v_source_group_id, p_target_group_id)
    AND archived_at IS NULL
  ORDER BY id::text
  FOR UPDATE;

  IF (
    SELECT count(*)
    FROM public.task_groups
    WHERE id IN (v_source_group_id, p_target_group_id)
      AND archived_at IS NULL
  ) <> (
    SELECT count(DISTINCT id)
    FROM (
      SELECT v_source_group_id AS id
      UNION ALL
      SELECT p_target_group_id AS id
    ) expected_groups
  ) THEN
    RAISE EXCEPTION 'Target group not found';
  END IF;

  UPDATE public.tasks
  SET group_id = p_target_group_id,
      sort_order = -1,
      updated_at = now(),
      updated_by = v_admin_id
  WHERE id = p_task_id
    AND archived_at IS NULL
    AND status <> 'done';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active task not found';
  END IF;

  PERFORM public.reorder_active_tasks(p_target_group_id, p_target_task_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_task_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid := public.assert_admin();
  v_archived_at timestamptz := now();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('admin_tasks:groups'));
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_tasks:group:' || p_group_id::text, 0));

  PERFORM 1
  FROM public.task_groups
  WHERE id = p_group_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task group not found';
  END IF;

  PERFORM 1
  FROM public.tasks
  WHERE group_id = p_group_id
    AND archived_at IS NULL
  FOR UPDATE;

  UPDATE public.task_groups
  SET archived_at = v_archived_at,
      archived_by = v_admin_id,
      updated_at = v_archived_at,
      updated_by = v_admin_id
  WHERE id = p_group_id
    AND archived_at IS NULL;

  UPDATE public.tasks
  SET archived_at = v_archived_at,
      archived_by = v_admin_id,
      updated_at = v_archived_at,
      updated_by = v_admin_id
  WHERE group_id = p_group_id
    AND archived_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_task_done_slice_by_group(
  p_group_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_cursor_completed_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS SETOF public.tasks
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH capped_limit AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50) AS value
  ),
  ranked AS (
    SELECT
      t.*,
      row_number() OVER (
        PARTITION BY t.group_id
        ORDER BY t.completed_at DESC, t.id DESC
      ) AS rn
    FROM public.tasks t
    INNER JOIN public.task_groups g ON g.id = t.group_id
    WHERE t.archived_at IS NULL
      AND g.archived_at IS NULL
      AND t.status = 'done'
      AND (p_group_id IS NULL OR t.group_id = p_group_id)
      AND (
        p_cursor_completed_at IS NULL
        OR (t.completed_at, t.id) < (p_cursor_completed_at, p_cursor_id)
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
  )
  SELECT id, group_id, title, description, assignee_id, due_date,
         status, priority, sort_order, completed_at, archived_at, archived_by,
         created_by, updated_by, created_at, updated_at
  FROM ranked
  WHERE (p_group_id IS NULL AND rn <= (SELECT value FROM capped_limit))
     OR (p_group_id IS NOT NULL)
  ORDER BY group_id, completed_at DESC, id DESC
  LIMIT CASE WHEN p_group_id IS NULL THEN NULL ELSE (SELECT value FROM capped_limit) END;
$$;

CREATE OR REPLACE FUNCTION public.get_task_done_slice_by_date_bucket(
  p_bucket text DEFAULT NULL,
  p_today date DEFAULT (now() AT TIME ZONE 'Europe/Bucharest')::date,
  p_limit integer DEFAULT 10,
  p_cursor_completed_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  bucket text,
  id uuid,
  group_id uuid,
  title text,
  description text,
  assignee_id uuid,
  due_date date,
  status public.task_status,
  priority public.task_priority,
  sort_order integer,
  completed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH capped_limit AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50) AS value
  ),
  bucketed AS (
    SELECT
      CASE
        WHEN t.due_date IS NULL THEN 'without_date'
        WHEN t.due_date < p_today THEN 'past'
        WHEN t.due_date = p_today THEN 'today'
        WHEN t.due_date = p_today + 1 THEN 'tomorrow'
        WHEN t.due_date <= (date_trunc('week', p_today::timestamp)::date + 6) THEN 'this_week'
        WHEN t.due_date <= (date_trunc('week', p_today::timestamp)::date + 13) THEN 'next_week'
        ELSE 'later'
      END AS bucket,
      t.*
    FROM public.tasks t
    INNER JOIN public.task_groups g ON g.id = t.group_id
    WHERE t.archived_at IS NULL
      AND g.archived_at IS NULL
      AND t.status = 'done'
      AND (
        p_cursor_completed_at IS NULL
        OR (t.completed_at, t.id) < (p_cursor_completed_at, p_cursor_id)
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
  ),
  ranked AS (
    SELECT
      bucketed.*,
      row_number() OVER (
        PARTITION BY bucket
        ORDER BY completed_at DESC, id DESC
      ) AS rn
    FROM bucketed
    WHERE p_bucket IS NULL OR bucket = p_bucket
  )
  SELECT bucket, id, group_id, title, description, assignee_id,
         due_date, status, priority, sort_order, completed_at, archived_at,
         archived_by, created_by, updated_by, created_at, updated_at
  FROM ranked
  WHERE (p_bucket IS NULL AND rn <= (SELECT value FROM capped_limit))
     OR (p_bucket IS NOT NULL)
  ORDER BY bucket, completed_at DESC, id DESC
  LIMIT CASE WHEN p_bucket IS NULL THEN NULL ELSE (SELECT value FROM capped_limit) END;
$$;

CREATE OR REPLACE FUNCTION public.get_task_done_counts_by_group()
RETURNS TABLE (group_id uuid, done_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.group_id, count(*) AS done_count
  FROM public.tasks t
  INNER JOIN public.task_groups g ON g.id = t.group_id
  WHERE t.archived_at IS NULL
    AND g.archived_at IS NULL
    AND t.status = 'done'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  GROUP BY t.group_id;
$$;

CREATE OR REPLACE FUNCTION public.get_task_done_counts_by_date_bucket(
  p_today date DEFAULT (now() AT TIME ZONE 'Europe/Bucharest')::date
)
RETURNS TABLE (bucket text, done_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN t.due_date IS NULL THEN 'without_date'
      WHEN t.due_date < p_today THEN 'past'
      WHEN t.due_date = p_today THEN 'today'
      WHEN t.due_date = p_today + 1 THEN 'tomorrow'
      WHEN t.due_date <= (date_trunc('week', p_today::timestamp)::date + 6) THEN 'this_week'
      WHEN t.due_date <= (date_trunc('week', p_today::timestamp)::date + 13) THEN 'next_week'
      ELSE 'later'
    END AS bucket,
    count(*) AS done_count
  FROM public.tasks t
  INNER JOIN public.task_groups g ON g.id = t.group_id
  WHERE t.archived_at IS NULL
    AND g.archived_at IS NULL
    AND t.status = 'done'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  GROUP BY bucket;
$$;

REVOKE ALL ON FUNCTION public.assert_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_no_duplicate_ids(uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_task_group(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_task_group(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_task(uuid, text, text, uuid, date, public.task_status, public.task_priority) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_task(uuid, text, text, uuid, boolean, date, boolean, public.task_status, public.task_priority) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_task_comment(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_task(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_task_groups(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reorder_active_tasks(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_active_task_to_group(uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_task_group(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_task_done_slice_by_group(uuid, integer, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_task_done_slice_by_date_bucket(text, date, integer, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_task_done_counts_by_group() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_task_done_counts_by_date_bucket(date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_task_group(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_task_group(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_task(uuid, text, text, uuid, date, public.task_status, public.task_priority) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_task(uuid, text, text, uuid, boolean, date, boolean, public.task_status, public.task_priority) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_task_comment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_task_groups(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_active_tasks(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_active_task_to_group(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_task_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_task_done_slice_by_group(uuid, integer, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_task_done_slice_by_date_bucket(text, date, integer, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_task_done_counts_by_group() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_task_done_counts_by_date_bucket(date) TO authenticated;

INSERT INTO public.task_groups (name, color, sort_order)
VALUES ('General tasks', 'blue', 1000);
