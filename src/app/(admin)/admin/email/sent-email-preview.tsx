"use client";

import { useEffect, useState } from "react";
import { Monitor, Smartphone, X } from "lucide-react";
import type { EmailSend } from "@/types/database";
import {
  getEmailSendTemplateInfoAction,
  type EmailSendTemplateInfo,
} from "./actions";

const DESKTOP_MAX_WIDTH = 680;
const MOBILE_WIDTH = 390;

type Viewport = "desktop" | "mobile";
type TemplateState = "loading" | "loaded" | "error";

/**
 * Modal preview of the exact email that went out for a given campaign. The
 * rendered HTML is the snapshot captured at send time (already on the send
 * row), and the template name + version is resolved on open so admins can see
 * which template version was used.
 */
export function SentEmailPreview({
  send,
  kindLabel,
  sentOn,
  onClose,
}: {
  send: EmailSend;
  kindLabel: string;
  sentOn: string | null;
  onClose: () => void;
}) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [templateInfo, setTemplateInfo] =
    useState<EmailSendTemplateInfo | null>(null);
  const [templateState, setTemplateState] = useState<TemplateState>("loading");
  const isMobile = viewport === "mobile";
  const html = send.html_preview_snapshot;

  // Resolve the template provenance once on open. State starts at "loading", so
  // we don't reset it here (the modal is remounted per send via its key).
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const info = await getEmailSendTemplateInfoAction(send.id);
        if (!active) return;
        setTemplateInfo(info);
        setTemplateState("loaded");
      } catch {
        if (!active) return;
        setTemplateState("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [send.id]);

  // Close on Escape, like the other dialogs in the studio.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = [sentOn, kindLabel].filter(Boolean).join(" · ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sent-preview-title"
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-md border border-border bg-background shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="sent-preview-title"
              className="text-base font-medium text-foreground"
            >
              Email preview
            </h2>
            <p className="mt-1 truncate text-sm text-foreground">
              <span className="text-muted-foreground">Subject: </span>
              {send.subject_template}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {meta}
              {templateState === "loading" && " · loading template…"}
              {templateState === "loaded" &&
                templateInfo &&
                ` · Template: ${templateInfo.templateName} (v${templateInfo.versionNumber})`}
              {templateState === "loaded" &&
                !templateInfo &&
                " · one-off design (no saved template)"}
              {templateState === "error" && " · couldn’t load template info"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="inline-flex rounded-md border border-border p-0.5">
              <button
                type="button"
                onClick={() => setViewport("desktop")}
                aria-pressed={!isMobile}
                aria-label="Desktop preview"
                className={`inline-flex items-center justify-center rounded p-1.5 transition-colors ${
                  !isMobile
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Monitor className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewport("mobile")}
                aria-pressed={isMobile}
                aria-label="Mobile preview"
                className={`inline-flex items-center justify-center rounded p-1.5 transition-colors ${
                  isMobile
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 justify-center overflow-auto bg-[#f3f4f6] p-4">
          {html ? (
            <iframe
              title="Sent email preview"
              srcDoc={html}
              sandbox=""
              className="h-full min-h-[55vh] w-full rounded-sm bg-white shadow-sm"
              style={{ maxWidth: isMobile ? MOBILE_WIDTH : DESKTOP_MAX_WIDTH }}
            />
          ) : (
            <p className="m-auto max-w-sm text-center text-sm text-muted-foreground">
              No stored preview is available for this campaign.
            </p>
          )}
        </div>

        <div className="border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            Exact content captured when this campaign was sent. Variables show
            sample values; each recipient saw their own. The unsubscribe footer
            is appended at delivery.
          </p>
        </div>
      </div>
    </div>
  );
}
