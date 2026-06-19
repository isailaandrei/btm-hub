"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminTask } from "@/types/database";
import { CreateTaskGroupForm } from "./task-forms";
import { TaskBoardView } from "./task-board-view";
import { useTaskData } from "./task-data-provider";
import { TaskDetailPanel } from "./task-detail-panel";

export function TasksPanel() {
  const {
    admins,
    groups,
    tasks,
    today,
    doneCountsByGroupId,
    tasksError,
    realtimeWarning,
    ensureTasks,
    refreshAfterMutation,
    optimisticallyUpdateGroup,
    optimisticallyUpdateTask,
    optimisticallyRemoveTask,
    loadMoreDoneForGroup,
  } = useTaskData();
  const [selectedTask, setSelectedTask] = useState<AdminTask | null>(null);

  useEffect(() => {
    ensureTasks();
  }, [ensureTasks]);

  const sharedError = tasksError;
  const ready = groups && tasks && admins && today;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Tasks</h2>
        </div>
      </div>

      {realtimeWarning && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="size-4" />
          {realtimeWarning}
        </div>
      )}

      {sharedError && (
        <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          <span>{sharedError}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void refreshAfterMutation()}>
            <RefreshCw />
            Retry
          </Button>
        </div>
      )}

      <CreateTaskGroupForm onSuccess={() => void refreshAfterMutation()} />

      {!ready && !sharedError && (
        <div className="rounded-md border border-border bg-card p-8 text-sm text-muted-foreground">
          Loading tasks...
        </div>
      )}

      {ready && groups.length === 0 && (
        <div className="rounded-md border border-border bg-card p-8 text-sm text-muted-foreground">
          No task groups yet.
        </div>
      )}

      {ready && groups.length > 0 && (
        <TaskBoardView
          groups={groups}
          tasks={tasks}
          today={today}
          doneCountsByGroupId={doneCountsByGroupId}
          admins={admins}
          onOpenTask={setSelectedTask}
          onRefresh={refreshAfterMutation}
          onShowMoreDone={loadMoreDoneForGroup}
          onOptimisticGroupUpdate={optimisticallyUpdateGroup}
          onOptimisticTaskUpdate={optimisticallyUpdateTask}
          onOptimisticTaskRemove={optimisticallyRemoveTask}
        />
      )}

      <TaskDetailPanel
        task={selectedTask}
        groups={groups ?? []}
        tasks={tasks ?? []}
        admins={admins ?? []}
        open={Boolean(selectedTask)}
        onOpenChange={(open) => {
          if (!open) setSelectedTask(null);
        }}
      />
    </section>
  );
}
