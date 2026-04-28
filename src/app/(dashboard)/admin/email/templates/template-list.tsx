"use client";

import type { EmailTemplate } from "@/types/database";

interface TemplateListProps {
  templates: EmailTemplate[];
  selectedTemplateId: string | null;
  onSelectTemplate: (templateId: string) => void;
}

export function TemplateList({
  templates,
  selectedTemplateId,
  onSelectTemplate,
}: TemplateListProps) {
  if (templates.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        No email templates yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/60 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {templates.map((template) => (
            <tr
              key={template.id}
              className={
                selectedTemplateId === template.id
                  ? "bg-primary/10"
                  : "hover:bg-muted/40"
              }
            >
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => onSelectTemplate(template.id)}
                  className="font-medium text-foreground hover:text-primary"
                >
                  {template.name}
                </button>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {template.category}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {template.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
