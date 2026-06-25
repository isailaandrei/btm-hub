import { createElement } from "react";
import { Rows2 } from "lucide-react";
import type { BlockItem, CommandProps } from "@maily-to/core/blocks";
import { Editor } from "@tiptap/core";
import {
  arrangeEmailRows,
  assertMailyDocument,
  createCardGapSection,
  DEFAULT_BODY_BACKGROUND,
} from "@/lib/email/rendering/maily";

/**
 * "Card split" block. Inserts a full-width band the same color as the backdrop,
 * which reads as a gap dividing the single email card into two stacked cards.
 * The email stays one container (the only client-safe shape) — the extra card is
 * an illusion. The band auto-tracks the backdrop: render repaints it, and the
 * editor canvas repaints it live via CSS (see [data-card-gap] in globals.css).
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Read the backdrop color the canvas is currently showing (the inherited
 *  `--email-canvas-backdrop` CSS var set by EmailDesigner) so the inserted band
 *  matches it immediately. Falls back to the default backdrop when unset (e.g.
 *  during SSR or before layout is wired). */
function currentBackdropColor(editor: Editor): string {
  if (typeof window === "undefined") return DEFAULT_BODY_BACKGROUND;
  const value = window
    .getComputedStyle(editor.view.dom)
    .getPropertyValue("--email-canvas-backdrop")
    .trim();
  return HEX.test(value) ? value : DEFAULT_BODY_BACKGROUND;
}

export const cardSplitCommand: BlockItem = {
  title: "Card split",
  description: "A backdrop-colored gap that splits the card into two",
  searchTerms: [
    "card",
    "split",
    "gap",
    "divider",
    "separate",
    "section",
    "break",
    "spacer",
  ],
  icon: createElement(Rows2, { size: 18 }),
  command: ({ editor, range }: CommandProps) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent(createCardGapSection(currentBackdropColor(editor)))
      .run();
    // The band is inserted inside whatever (guttered) section the cursor was in,
    // so it would render inset. Re-arrange the document so the full-width band
    // pops out to the card edges — matching the renderer exactly. Deferred to a
    // microtask so we don't mutate the doc inside the command's own transaction.
    queueMicrotask(() => {
      if (editor.isDestroyed) return;
      const arranged = arrangeEmailRows(assertMailyDocument(editor.getJSON()));
      editor.commands.setContent(arranged);
    });
  },
};
