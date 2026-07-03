"use client";

import { useEffect, useRef } from "react";

/**
 * Drives the browser's print / "Save as PDF" flow for the standalone print
 * route: auto-opens the print dialog once on mount (the route is only ever
 * reached via the admin "Export PDF" action, so printing is the intent) and
 * renders an on-screen toolbar (hidden when printing) so the admin can re-open
 * the dialog if they dismissed it. The default PDF filename comes from the
 * page's <title> (set in generateMetadata), not from here.
 */
export function PrintTrigger() {
  const printedRef = useRef(false);

  useEffect(() => {
    // Guard against React's dev double-invoke and refreshes re-triggering print.
    if (printedRef.current) return;
    printedRef.current = true;
    // Defer a frame so fonts/layout settle before the dialog snapshots the page.
    const id = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="pdf-no-print print:hidden sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-neutral-200 bg-neutral-50 px-6 py-3">
      <p className="text-sm text-neutral-600">
        Use your browser&rsquo;s <span className="font-medium">Save as PDF</span>{" "}
        option to export this application.
      </p>
      <button
        type="button"
        onClick={() => window.print()}
        className="shrink-0 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
