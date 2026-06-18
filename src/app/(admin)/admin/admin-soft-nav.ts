import type { MouseEvent } from "react";

/**
 * Shared modifier-key guard for in-app soft navigation. A plain left-click is
 * a soft navigation (`window.history.pushState`, no server round-trip); any
 * modified click (cmd/ctrl/shift/alt/middle) or `target` link falls through to
 * the real `<Link>` so the route opens normally (e.g. in a new tab).
 */
export function shouldSoftNavigate(
  event: MouseEvent<HTMLAnchorElement>,
): boolean {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey ||
    Boolean(event.currentTarget.target)
  );
}

/** Update the URL without a server navigation (keeps the workspace mounted). */
export function softNavigate(href: string): void {
  window.history.pushState(null, "", href);
}

/**
 * Build an anchor `onClick` handler that soft-navigates on a plain left-click
 * and defers to default browser behaviour for modified clicks. `onSoftNavigate`
 * runs only on the soft-nav path (e.g. to warm a cache before the URL changes).
 */
export function createSoftNavClickHandler(
  href: string,
  onSoftNavigate?: () => void,
) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldSoftNavigate(event)) return;
    event.preventDefault();
    onSoftNavigate?.();
    softNavigate(href);
  };
}
