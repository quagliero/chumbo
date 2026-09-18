import { Component, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { DataLoadFailedError, clearLoadFailure } from "@/data/loadFailure";

/**
 * What a reader sees when a page cannot load, instead of a blank screen.
 *
 * Before this there was no boundary above the routes at all, so two failures
 * had no floor under them:
 *
 *   - A season's data failing to download (offline, a dropped connection on a
 *     phone) now surfaces as `DataLoadFailedError` rather than an endless
 *     silent retry — see that class in `@/data/loadFailure`.
 *   - A page's own code chunk failing to download (a stale tab after a
 *     deploy): `React.lazy` rethrows that as an ordinary error, and with no
 *     boundary React unmounted the whole app.
 *
 * The button reloads, for both. It first tried to recover in place, and that
 * cannot work: the browser caches a failed dynamic `import()` for the life of
 * the page, so importing the same chunk again fails at once without touching
 * the network (verified against the production build with a chunk removed —
 * the retry made no request). A reload is the only real second attempt.
 *
 * It sits inside `<main>`, so the header stays usable, and it resets on
 * navigation — leaving a failed page is a deliberate retry, not a loop.
 */

interface State {
  error: unknown;
}

class Boundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown) {
    // Still reaches the console, so a real bug is not hidden by the message.
    console.error(error);
  }

  // See the note at the top: a reload is the only real second attempt.
  private retry = () => window.location.reload();

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const offline = error instanceof DataLoadFailedError;
    return (
      <div
        role="alert"
        className="mx-auto max-w-md rounded-card border border-line bg-surface p-6 text-center shadow-card"
      >
        <h2 className="text-lg font-semibold text-ink">
          {offline ? "Couldn't load the league data" : "This page didn't load"}
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          {offline
            ? "Part of the archive failed to download. Check your connection, then reload."
            : "Something went wrong loading this page — usually a new version of the site went live while it was open."}
        </p>
        <button
          type="button"
          onClick={this.retry}
          className="mt-4 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1"
        >
          Reload
        </button>
      </div>
    );
  }
}

/** Keyed on the path, so moving to another page starts from a clean slate. */
export const AppErrorBoundary = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();
  const lastPath = useRef(pathname);

  // Leaving a page is the reader's own retry, so the next page may attempt
  // its downloads. Done during render, not in an effect: the new page's
  // children render in this same pass and would otherwise still see the old
  // failure. Idempotent, so a repeated render cannot do it twice.
  if (lastPath.current !== pathname) {
    lastPath.current = pathname;
    clearLoadFailure();
  }

  return <Boundary key={pathname}>{children}</Boundary>;
};
