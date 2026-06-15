"use client";

import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { AdminAssigneeProfile, AdminTask } from "@/types/database";
import {
  DEFAULT_DONE_TASK_LIMIT,
  TASK_DATE_BUCKET_ORDER,
} from "./constants";
import {
  getTaskDateBucket,
  type TaskDateBucket,
} from "./date-buckets";
import { TaskRow } from "./task-row";

const BUCKET_LABELS: Record<TaskDateBucket, string> = {
  past: "Past dates",
  today: "Today",
  tomorrow: "Tomorrow",
  this_week: "This week",
  next_week: "Next week",
  later: "Later",
  without_date: "Without date",
};

export function TaskDateView({
  tasks,
  today,
  doneCountsByDateBucket,
  admins,
  onOpenTask,
  onRefresh,
  onShowMoreDone,
}: {
  tasks: AdminTask[];
  today: string;
  doneCountsByDateBucket: Record<TaskDateBucket, number>;
  admins: AdminAssigneeProfile[];
  onOpenTask: (task: AdminTask) => void;
  onRefresh: () => Promise<void>;
  onShowMoreDone: (bucket: TaskDateBucket) => Promise<void>;
}) {
  const [hideDone, setHideDone] = useState(false);
  const [expandedBuckets, setExpandedBuckets] = useState<Set<TaskDateBucket>>(new Set());

  const buckets = useMemo(() => {
    const result = Object.fromEntries(
      TASK_DATE_BUCKET_ORDER.map((bucket) => [bucket, [] as AdminTask[]]),
    ) as Record<TaskDateBucket, AdminTask[]>;

    for (const task of tasks) {
      if (hideDone && task.status === "done") continue;
      result[getTaskDateBucket(task.due_date, today)].push(task);
    }

    for (const bucket of TASK_DATE_BUCKET_ORDER) {
      result[bucket].sort((left, right) => {
        if (left.status === "done" && right.status === "done") {
          return (
            (right.completed_at ?? "").localeCompare(left.completed_at ?? "") ||
            right.id.localeCompare(left.id)
          );
        }
        if (left.status === "done") return 1;
        if (right.status === "done") return -1;
        return (
          (left.due_date ?? "9999-12-31").localeCompare(right.due_date ?? "9999-12-31") ||
          left.sort_order - right.sort_order
        );
      });
    }

    return result;
  }, [hideDone, tasks, today]);

  async function showMore(bucket: TaskDateBucket) {
    try {
      await onShowMoreDone(bucket);
      setExpandedBuckets((prev) => new Set(prev).add(bucket));
    } catch {
      // The data provider surfaces the load failure and keeps the bucket collapsed.
    }
  }

  return (
    <div className="space-y-4">
      <label className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm">
        <Checkbox
          checked={hideDone}
          onCheckedChange={(checked) => setHideDone(Boolean(checked))}
        />
        Hide done
      </label>

      {TASK_DATE_BUCKET_ORDER.map((bucket) => {
        const bucketTasks = buckets[bucket];
        const visibleTasks = expandedBuckets.has(bucket)
          ? bucketTasks
          : bucketTasks.slice(0, DEFAULT_DONE_TASK_LIMIT + bucketTasks.filter((task) => task.status !== "done").length);
        const doneVisible = visibleTasks.filter((task) => task.status === "done").length;
        const doneTotal = doneCountsByDateBucket[bucket] ?? 0;
        const hiddenDoneCount = hideDone ? 0 : Math.max(0, doneTotal - doneVisible);

        return (
          <section key={bucket} className="border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
              <h3 className="text-sm font-semibold">{BUCKET_LABELS[bucket]}</h3>
              <span className="text-xs text-muted-foreground">
                {visibleTasks.length} visible
              </span>
            </div>
            {visibleTasks.length === 0 ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">
                No tasks in this bucket.
              </div>
            ) : (
              visibleTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  admins={admins}
                  onOpen={onOpenTask}
                  onRefresh={onRefresh}
                  compact
                />
              ))
            )}
            {hiddenDoneCount > 0 && (
              <div className="border-t border-border px-3 py-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void showMore(bucket)}
                >
                  Show {Math.min(hiddenDoneCount, DEFAULT_DONE_TASK_LIMIT)} more done tasks
                </Button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
