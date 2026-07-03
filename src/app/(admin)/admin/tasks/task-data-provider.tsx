"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { logAdminTiming, startAdminTiming } from "@/lib/admin/timing";
import { createClient } from "@/lib/supabase/client";
import type {
  AdminAssigneeProfile,
  AdminTask,
  TaskComment,
  TaskGroup,
  TaskPriority,
  TaskStatus,
} from "@/types/database";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  loadMoreDoneTasksForDateBucketAction,
  loadMoreDoneTasksForGroupAction,
  loadTaskBoardDataAction,
  loadTaskCommentsAction,
  loadTaskDateViewDataAction,
  type TaskBoardData,
  type TaskDateViewData,
  type TaskDoneCursor,
} from "./task-loaders";
import type { TaskDateBucket } from "./date-buckets";
import { TASK_DATE_BUCKET_ORDER } from "./constants";

type FetchState = "idle" | "loading" | "done";
export type TaskUpdatePatch = Partial<{
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
  status: TaskStatus;
  priority: TaskPriority;
}>;
export type OptimisticGroupPatch = Partial<Pick<TaskGroup, "name" | "color">>;
export type OptimisticTaskPatch = Partial<
  Pick<
    AdminTask,
    | "title"
    | "description"
    | "group_id"
    | "assignee_id"
    | "due_date"
    | "status"
    | "priority"
    | "sort_order"
    | "completed_at"
  >
>;

interface TaskDataContextValue {
  admins: AdminAssigneeProfile[] | null;
  groups: TaskGroup[] | null;
  tasks: AdminTask[] | null;
  dateTasks: AdminTask[] | null;
  today: string | null;
  doneCountsByGroupId: Record<string, number>;
  doneCountsByDateBucket: Record<TaskDateBucket, number>;
  commentsByTaskId: Record<string, TaskComment[]>;
  tasksError: string | null;
  dateViewError: string | null;
  commentsError: string | null;
  realtimeWarning: string | null;
  ensureTasks: () => void;
  ensureDateTasks: () => void;
  reloadTasks: () => Promise<boolean>;
  reloadDateTasks: () => Promise<void>;
  refreshAfterMutation: () => Promise<void>;
  optimisticallyUpdateGroup: (groupId: string, patch: OptimisticGroupPatch) => void;
  optimisticallyUpdateTask: (taskId: string, patch: OptimisticTaskPatch) => void;
  optimisticallyRemoveTask: (taskId: string) => void;
  loadMoreDoneForGroup: (groupId: string) => Promise<void>;
  loadMoreDoneForDateBucket: (bucket: TaskDateBucket) => Promise<void>;
  ensureComments: (taskId: string) => Promise<void>;
  reloadComments: (taskId: string) => Promise<void>;
}

const TaskDataContext = createContext<TaskDataContextValue | null>(null);

function emptyBucketRecord<T>(value: T): Record<TaskDateBucket, T> {
  return Object.fromEntries(
    TASK_DATE_BUCKET_ORDER.map((bucket) => [bucket, value]),
  ) as Record<TaskDateBucket, T>;
}

function mergeById<T extends { id: string }>(current: T[] | null, next: T[]) {
  const map = new Map((current ?? []).map((item) => [item.id, item]));
  for (const item of next) map.set(item.id, item);
  return [...map.values()];
}

function patchById<T extends { id: string }>(
  current: T[] | null,
  id: string,
  patch: Partial<T>,
) {
  if (!current) return current;
  return current.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function sortAdminProfiles(profiles: AdminAssigneeProfile[]) {
  return [...profiles].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function upsertAdminProfile(
  current: AdminAssigneeProfile[] | null,
  profile: Partial<AdminAssigneeProfile> & { id: string },
) {
  if (profile.role && profile.role !== "admin") {
    return (current ?? []).filter((item) => item.id !== profile.id);
  }

  const existing = (current ?? []).find((item) => item.id === profile.id);
  if (!existing && profile.role !== "admin") return current ?? [];

  const nextProfile = {
    ...existing,
    ...profile,
  } as AdminAssigneeProfile;
  const withoutExisting = (current ?? []).filter((item) => item.id !== profile.id);
  return sortAdminProfiles([nextProfile, ...withoutExisting]);
}

export function buildOptimisticTaskPatch(
  task: AdminTask,
  patch: TaskUpdatePatch,
): OptimisticTaskPatch {
  const optimisticPatch: OptimisticTaskPatch = {};

  if (patch.title !== undefined) optimisticPatch.title = patch.title;
  if (patch.description !== undefined) optimisticPatch.description = patch.description;
  if (patch.assigneeId !== undefined) optimisticPatch.assignee_id = patch.assigneeId;
  if (patch.dueDate !== undefined) optimisticPatch.due_date = patch.dueDate;
  if (patch.priority !== undefined) optimisticPatch.priority = patch.priority;
  if (patch.status !== undefined) {
    optimisticPatch.status = patch.status;
    optimisticPatch.completed_at =
      patch.status === "done"
        ? task.completed_at ?? new Date().toISOString()
        : null;
  }

  return optimisticPatch;
}

const TASKS_RESYNC_MIN_INTERVAL_MS = 30_000;

export function TaskDataProvider({ children }: { children: ReactNode }) {
  const [admins, setAdmins] = useState<AdminAssigneeProfile[] | null>(null);
  const [groups, setGroups] = useState<TaskGroup[] | null>(null);
  const [tasks, setTasks] = useState<AdminTask[] | null>(null);
  const [dateTasks, setDateTasks] = useState<AdminTask[] | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [doneCountsByGroupId, setDoneCountsByGroupId] = useState<Record<string, number>>({});
  const [doneCountsByDateBucket, setDoneCountsByDateBucket] =
    useState<Record<TaskDateBucket, number>>(emptyBucketRecord(0));
  const [doneCursorsByGroupId, setDoneCursorsByGroupId] = useState<Record<string, TaskDoneCursor | null>>({});
  const [doneCursorsByDateBucket, setDoneCursorsByDateBucket] =
    useState<Record<TaskDateBucket, TaskDoneCursor | null>>(emptyBucketRecord(null));
  const [commentsByTaskId, setCommentsByTaskId] = useState<Record<string, TaskComment[]>>({});
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [dateViewError, setDateViewError] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [realtimeWarning, setRealtimeWarning] = useState<string | null>(null);

  const tasksFetchState = useRef<FetchState>("idle");
  const dateFetchState = useRef<FetchState>("idle");
  const commentsFetchState = useRef<Record<string, FetchState>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dateLoadedRef = useRef(false);
  // Realtime health + resync. `realtimeDegradedRef` gates warn-once and lets
  // mutations know whether the write will echo back (so an explicit reload would
  // just double the fetch). `reloadInFlightRef` coalesces overlapping reloads.
  const realtimeDegradedRef = useRef(false);
  const reloadInFlightRef = useRef<Promise<boolean> | null>(null);
  const lastResyncAtRef = useRef(0);

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const applyBoardData = useCallback((data: TaskBoardData) => {
    setAdmins(data.admins);
    setGroups(data.groups);
    setTasks([...data.activeTasks, ...data.doneTasks]);
    setDoneCountsByGroupId(data.doneCountsByGroupId);
    setDoneCursorsByGroupId(data.doneCursorsByGroupId);
    setToday(data.today);
    setTasksError(null);
  }, []);

  const applyDateData = useCallback((data: TaskDateViewData) => {
    setDateTasks([...data.activeTasks, ...data.doneTasks]);
    setDoneCountsByDateBucket(data.doneCountsByDateBucket);
    setDoneCursorsByDateBucket(data.doneCursorsByDateBucket);
    setToday(data.today);
    setDateViewError(null);
    dateLoadedRef.current = true;
  }, []);

  const reloadTasks = useCallback((): Promise<boolean> => {
    // Coalesce overlapping reloads (an explicit refresh, a realtime echo and a
    // reconnect resync can all fire close together) into one board fetch.
    if (reloadInFlightRef.current) return reloadInFlightRef.current;

    const run = async (): Promise<boolean> => {
      const startedAt = startAdminTiming();
      let activeTasks = 0;
      let doneTasks = 0;
      let groups = 0;
      let status = "ok";

      try {
        const data = await loadTaskBoardDataAction();
        activeTasks = data.activeTasks.length;
        doneTasks = data.doneTasks.length;
        groups = data.groups.length;
        applyBoardData(data);
        tasksFetchState.current = "done";
        return true;
      } catch (error) {
        status = "error";
        tasksFetchState.current = "idle";
        setTasksError("Failed to load tasks.");
        toast.error(error instanceof Error ? error.message : "Failed to load tasks.");
        return false;
      } finally {
        logAdminTiming("admin.tasks.board.client", startedAt, {
          activeTasks,
          doneTasks,
          groups,
          status,
        });
      }
    };

    const promise = run().finally(() => {
      reloadInFlightRef.current = null;
    });
    reloadInFlightRef.current = promise;
    return promise;
  }, [applyBoardData]);

  const reloadDateTasks = useCallback(async () => {
    const startedAt = startAdminTiming();
    let activeTasks = 0;
    let doneTasks = 0;
    let status = "ok";

    try {
      const data = await loadTaskDateViewDataAction();
      activeTasks = data.activeTasks.length;
      doneTasks = data.doneTasks.length;
      applyDateData(data);
      dateFetchState.current = "done";
    } catch (error) {
      status = "error";
      dateFetchState.current = "idle";
      setDateViewError("Failed to load date view.");
      toast.error(error instanceof Error ? error.message : "Failed to load date view.");
    } finally {
      logAdminTiming("admin.tasks.date.client", startedAt, {
        activeTasks,
        doneTasks,
        status,
      });
    }
  }, [applyDateData]);

  // Authoritative reconcile — always reloads. The realtime echo, the reconnect
  // resync and the wake listener use this.
  const reconcileBoard = useCallback(async () => {
    await reloadTasks();
    if (dateLoadedRef.current) await reloadDateTasks();
  }, [reloadDateTasks, reloadTasks]);

  // Called by mutation handlers on BOTH the success and error paths, and it
  // always reloads. The error paths (persistPatch/moveToGroup/deleteTask catch
  // blocks) rely on it to revert a failed optimistic patch to server truth — and
  // a failed write produces NO realtime echo, so skipping the reload when the
  // channel merely looks connected would leave a fake success on screen (a
  // fail-loud violation). It also covers a write committed before the channel
  // finishes its subscribe handshake, which likewise never echoes. On a
  // successful write the realtime echo may reload a second time; that redundancy
  // is acceptable and reloadTasks' in-flight guard coalesces overlapping reloads.
  const refreshAfterMutation = useCallback(async () => {
    await reconcileBoard();
  }, [reconcileBoard]);

  const optimisticallyUpdateGroup = useCallback(
    (groupId: string, patch: OptimisticGroupPatch) => {
      setGroups((prev) => patchById<TaskGroup>(prev, groupId, patch));
    },
    [],
  );

  const optimisticallyUpdateTask = useCallback(
    (taskId: string, patch: OptimisticTaskPatch) => {
      setTasks((prev) => patchById<AdminTask>(prev, taskId, patch));
      setDateTasks((prev) => patchById<AdminTask>(prev, taskId, patch));
    },
    [],
  );

  const optimisticallyRemoveTask = useCallback((taskId: string) => {
    setTasks((prev) => prev?.filter((task) => task.id !== taskId) ?? prev);
    setDateTasks((prev) => prev?.filter((task) => task.id !== taskId) ?? prev);
    setCommentsByTaskId((prev) => {
      if (!(taskId in prev)) return prev;
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }, []);

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimeoutRef.current ?? undefined);
    refreshTimeoutRef.current = setTimeout(() => {
      void reconcileBoard();
    }, 200);
  }, [reconcileBoard]);

  const ensureRealtime = useCallback(() => {
    if (channelRef.current) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel("admin-tasks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_groups" },
        () => scheduleRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => scheduleRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "profiles" },
        (payload) => {
          setAdmins((prev) =>
            upsertAdminProfile(
              prev,
              payload.new as Partial<AdminAssigneeProfile> & { id: string },
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          setAdmins((prev) =>
            upsertAdminProfile(
              prev,
              payload.new as Partial<AdminAssigneeProfile> & { id: string },
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "profiles" },
        (payload) => {
          setAdmins(
            (prev) =>
              prev?.filter(
                (profile) =>
                  profile.id !==
                  (payload.old as Partial<AdminAssigneeProfile>).id,
              ) ?? prev,
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_comments" },
        (payload) => {
          const comment = payload.new as TaskComment;
          setCommentsByTaskId((prev) => ({
            ...prev,
            [comment.task_id]: mergeById(prev[comment.task_id] ?? [], [comment]),
          }));
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (!realtimeDegradedRef.current) {
            realtimeDegradedRef.current = true;
            setRealtimeWarning(
              "Task updates disconnected — reconnecting…",
            );
            toast.warning("Task updates disconnected.");
          }
        } else if (status === "SUBSCRIBED" && realtimeDegradedRef.current) {
          // Recovered: clear the (previously sticky) warning and resync, since
          // postgres_changes did not replay events missed while disconnected.
          realtimeDegradedRef.current = false;
          setRealtimeWarning(null);
          toast.success("Task updates reconnected.");
          void reconcileBoard();
        }
      });

    channelRef.current = channel;
  }, [reconcileBoard, scheduleRefresh]);

  const ensureTasks = useCallback(() => {
    if (tasksFetchState.current !== "idle") return;
    tasksFetchState.current = "loading";
    void reloadTasks().then((loaded) => {
      if (loaded) ensureRealtime();
    });
  }, [ensureRealtime, reloadTasks]);

  const ensureDateTasks = useCallback(() => {
    if (dateFetchState.current !== "idle") return;
    dateFetchState.current = "loading";
    void reloadDateTasks();
  }, [reloadDateTasks]);

  const loadMoreDoneForGroup = useCallback(
    async (groupId: string) => {
      try {
        const result = await loadMoreDoneTasksForGroupAction(
          groupId,
          doneCursorsByGroupId[groupId] ?? null,
        );
        setTasks((prev) => mergeById(prev, result.tasks));
        setDoneCursorsByGroupId((prev) => ({ ...prev, [groupId]: result.cursor }));
        setTasksError(null);
      } catch (error) {
        setTasksError("Failed to load more done tasks.");
        toast.error(error instanceof Error ? error.message : "Failed to load more done tasks.");
        throw error;
      }
    },
    [doneCursorsByGroupId],
  );

  const loadMoreDoneForDateBucket = useCallback(
    async (bucket: TaskDateBucket) => {
      try {
        const result = await loadMoreDoneTasksForDateBucketAction(
          bucket,
          doneCursorsByDateBucket[bucket] ?? null,
        );
        setDateTasks((prev) => mergeById(prev, result.tasks));
        setDoneCursorsByDateBucket((prev) => ({ ...prev, [bucket]: result.cursor }));
        setDateViewError(null);
      } catch (error) {
        setDateViewError("Failed to load more done tasks.");
        toast.error(error instanceof Error ? error.message : "Failed to load more done tasks.");
        throw error;
      }
    },
    [doneCursorsByDateBucket],
  );

  const loadComments = useCallback(async (taskId: string, force = false) => {
    if (commentsFetchState.current[taskId] === "loading") return;
    if (!force && commentsFetchState.current[taskId] === "done") return;
    commentsFetchState.current[taskId] = "loading";

    try {
      const comments = await loadTaskCommentsAction(taskId);
      setCommentsByTaskId((prev) => ({ ...prev, [taskId]: comments }));
      setCommentsError(null);
      commentsFetchState.current[taskId] = "done";
    } catch (error) {
      commentsFetchState.current[taskId] = "idle";
      setCommentsError("Failed to load comments.");
      toast.error(error instanceof Error ? error.message : "Failed to load comments.");
    }
  }, []);

  const ensureComments = useCallback(
    (taskId: string) => loadComments(taskId, false),
    [loadComments],
  );

  const reloadComments = useCallback(
    (taskId: string) => loadComments(taskId, true),
    [loadComments],
  );

  // Wake resync: on tab focus / network restore, converge on authoritative task
  // state (a dropped socket does not replay the gap). Throttled; only once the
  // board has loaded. Channel recovery resyncs too via the subscribe handler.
  useEffect(() => {
    function handleWake() {
      if (document.visibilityState !== "visible") return;
      if (tasksFetchState.current !== "done") return;
      const now = Date.now();
      if (now - lastResyncAtRef.current < TASKS_RESYNC_MIN_INTERVAL_MS) return;
      lastResyncAtRef.current = now;
      void reconcileBoard();
    }
    document.addEventListener("visibilitychange", handleWake);
    window.addEventListener("online", handleWake);
    return () => {
      document.removeEventListener("visibilitychange", handleWake);
      window.removeEventListener("online", handleWake);
    };
  }, [reconcileBoard]);

  useEffect(() => {
    return () => {
      clearTimeout(refreshTimeoutRef.current ?? undefined);
      if (channelRef.current && supabaseRef.current) {
        void supabaseRef.current.removeChannel(channelRef.current);
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      admins,
      groups,
      tasks,
      dateTasks,
      today,
      doneCountsByGroupId,
      doneCountsByDateBucket,
      commentsByTaskId,
      tasksError,
      dateViewError,
      commentsError,
      realtimeWarning,
      ensureTasks,
      ensureDateTasks,
      reloadTasks,
      reloadDateTasks,
      refreshAfterMutation,
      optimisticallyUpdateGroup,
      optimisticallyUpdateTask,
      optimisticallyRemoveTask,
      loadMoreDoneForGroup,
      loadMoreDoneForDateBucket,
      ensureComments,
      reloadComments,
    }),
    [
      admins,
      groups,
      tasks,
      dateTasks,
      today,
      doneCountsByGroupId,
      doneCountsByDateBucket,
      commentsByTaskId,
      tasksError,
      dateViewError,
      commentsError,
      realtimeWarning,
      ensureTasks,
      ensureDateTasks,
      reloadTasks,
      reloadDateTasks,
      refreshAfterMutation,
      optimisticallyUpdateGroup,
      optimisticallyUpdateTask,
      optimisticallyRemoveTask,
      loadMoreDoneForGroup,
      loadMoreDoneForDateBucket,
      ensureComments,
      reloadComments,
    ],
  );

  return (
    <TaskDataContext.Provider value={value}>
      {children}
    </TaskDataContext.Provider>
  );
}

export function useTaskData() {
  const context = useContext(TaskDataContext);
  if (!context) {
    throw new Error("useTaskData must be used within TaskDataProvider");
  }
  return context;
}
