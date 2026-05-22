CREATE OR REPLACE FUNCTION public.delete_task(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  PERFORM public.assert_admin();

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

  DELETE FROM public.tasks t
  USING public.task_groups g
  WHERE t.id = p_task_id
    AND t.group_id = v_group_id
    AND g.id = t.group_id
    AND t.archived_at IS NULL
    AND g.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_task(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_task(uuid) TO authenticated;
