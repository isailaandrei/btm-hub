import type {
  TaskGroupColor,
  TaskPriority,
  TaskStatus,
} from "@/types/database";

export const TASK_STATUS_VALUES = [
  "not_started",
  "working_on_it",
  "waiting",
  "done",
] as const satisfies readonly TaskStatus[];

export const TASK_PRIORITY_VALUES = [
  "low",
  "normal",
  "high",
  "critical",
] as const satisfies readonly TaskPriority[];

export const TASK_GROUP_COLORS = [
  "blue",
  "teal",
  "green",
  "amber",
  "orange",
  "red",
  "pink",
  "purple",
  "slate",
] as const satisfies readonly TaskGroupColor[];

export const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; className: string }
> = {
  not_started: {
    label: "Not started",
    className: "bg-muted text-muted-foreground",
  },
  working_on_it: {
    label: "Working on it",
    className: "bg-blue-500 text-white",
  },
  waiting: {
    label: "Waiting",
    className: "bg-yellow-400 text-yellow-950",
  },
  done: {
    label: "Done",
    className: "bg-green-500 text-white",
  },
};

export const TASK_PRIORITY_META: Record<
  TaskPriority,
  { label: string; className: string }
> = {
  low: { label: "Low", className: "bg-blue-400 text-white" },
  normal: {
    label: "Medium",
    className: "bg-indigo-500 text-white",
  },
  high: { label: "High", className: "bg-purple-900 text-white" },
  critical: { label: "Critical", className: "bg-rose-600 text-white" },
};

export const TASK_GROUP_COLOR_META: Record<
  TaskGroupColor,
  {
    label: string;
    className: string;
    textClassName: string;
    markerClassName: string;
    borderClassName: string;
  }
> = {
  blue: {
    label: "Blue",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    textClassName: "text-blue-700",
    markerClassName: "bg-blue-500",
    borderClassName: "border-l-blue-500",
  },
  teal: {
    label: "Teal",
    className: "bg-teal-50 text-teal-700 border-teal-200",
    textClassName: "text-teal-700",
    markerClassName: "bg-teal-500",
    borderClassName: "border-l-teal-500",
  },
  green: {
    label: "Green",
    className: "bg-green-50 text-green-700 border-green-200",
    textClassName: "text-green-700",
    markerClassName: "bg-green-500",
    borderClassName: "border-l-green-500",
  },
  amber: {
    label: "Amber",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    textClassName: "text-amber-700",
    markerClassName: "bg-amber-500",
    borderClassName: "border-l-amber-500",
  },
  orange: {
    label: "Orange",
    className: "bg-orange-50 text-orange-700 border-orange-200",
    textClassName: "text-orange-700",
    markerClassName: "bg-orange-500",
    borderClassName: "border-l-orange-500",
  },
  red: {
    label: "Red",
    className: "bg-red-50 text-red-700 border-red-200",
    textClassName: "text-red-700",
    markerClassName: "bg-red-500",
    borderClassName: "border-l-red-500",
  },
  pink: {
    label: "Pink",
    className: "bg-pink-50 text-pink-700 border-pink-200",
    textClassName: "text-pink-700",
    markerClassName: "bg-pink-500",
    borderClassName: "border-l-pink-500",
  },
  purple: {
    label: "Purple",
    className: "bg-purple-50 text-purple-700 border-purple-200",
    textClassName: "text-purple-700",
    markerClassName: "bg-purple-500",
    borderClassName: "border-l-purple-500",
  },
  slate: {
    label: "Slate",
    className: "bg-slate-50 text-slate-700 border-slate-200",
    textClassName: "text-slate-700",
    markerClassName: "bg-slate-500",
    borderClassName: "border-l-slate-500",
  },
};

export const DEFAULT_DONE_TASK_LIMIT = 10;
export const TASK_DATE_BUCKET_ORDER = [
  "past",
  "today",
  "tomorrow",
  "this_week",
  "next_week",
  "later",
  "without_date",
] as const;
