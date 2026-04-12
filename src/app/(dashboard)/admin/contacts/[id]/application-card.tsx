"use client";

import { useState } from "react";
import { getFormDefinition } from "@/lib/academy/forms";
import type { Application } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { STATUS_BADGE_CLASS } from "../../applications/constants";
import { StatusSelector } from "../../applications/[id]/StatusSelector";
import { DeleteApplicationButton } from "./delete-buttons";

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "number") return `${value}/10`;
  return String(value);
}

interface ApplicationCardProps {
  application: Application;
  defaultOpen: boolean;
}

export function ApplicationCard({ application, defaultOpen }: ApplicationCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const formDef = getFormDefinition(application.program);

  return (
    <Card>
      <CardHeader className="p-0">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-muted/30"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium capitalize text-foreground">
              {application.program}
            </span>
            <Badge
              variant="outline"
              className={`capitalize ${STATUS_BADGE_CLASS[application.status]}`}
            >
              {application.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {new Date(application.submitted_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </CardHeader>

      {open && (
        <CardContent className="border-t border-border pt-4">
          <div className="mb-6 flex items-center justify-between">
            <StatusSelector
              applicationId={application.id}
              currentStatus={application.status}
            />
            <DeleteApplicationButton
              applicationId={application.id}
              program={application.program}
            />
          </div>

          <div className="flex flex-col gap-6">
            {formDef ? (
              formDef.steps.map((step) => (
                <div key={step.id}>
                  <h3 className="mb-3 text-sm font-medium text-foreground">{step.title}</h3>
                  <dl className="flex flex-col gap-3">
                    {step.fields.map((field) => (
                      <div key={field.name} className="flex flex-col gap-0.5">
                        <dt className="text-xs text-muted-foreground">{field.label}</dt>
                        <dd className="text-sm text-foreground">
                          {formatValue(application.answers[field.name])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))
            ) : (
              <dl className="flex flex-col gap-3">
                {Object.entries(application.answers).map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">{key}</dt>
                    <dd className="text-sm text-foreground">{formatValue(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
