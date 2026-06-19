"use client";

import { useState } from "react";
import { Filter, ShieldOff, Users } from "lucide-react";
import { ExcludedSection } from "./excluded-section";
import { ListsSection } from "./lists-section";
import { SegmentsSection } from "./segments-section";

type AudienceSection = "lists" | "segments" | "excluded";

const SECTIONS: Array<{
  key: AudienceSection;
  label: string;
  icon: typeof Users;
}> = [
  { key: "lists", label: "Lists", icon: Users },
  { key: "segments", label: "Segments", icon: Filter },
  { key: "excluded", label: "Excluded", icon: ShieldOff },
];

export function AudiencesPanel() {
  const [section, setSection] = useState<AudienceSection>("lists");

  return (
    <div className="flex flex-col gap-4">
      <div className="inline-flex w-fit rounded-md border border-border p-0.5">
        {SECTIONS.map(({ key, label, icon: Icon }) => {
          const isActive = section === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {section === "lists" ? (
        <ListsSection />
      ) : section === "segments" ? (
        <SegmentsSection />
      ) : (
        <ExcludedSection />
      )}
    </div>
  );
}
