/**
 * When a download fails (the retry loop). Deliberately a module with no
 * imports: the app's error boundary sits in the shell and needs these, and
 * importing them from `@/data` put the whole data loader on the critical path
 * of every page (77 kB -> 85 kB). See `DataLoadFailedError`.
 */

/**
 * A chunk of league data could not be downloaded — offline, a dropped
 * connection on a phone, a deploy that removed an old chunk under a stale tab.
 *
 * Why this exists: a failed load clears its in-flight entry, React re-renders
 * when the thrown promise settles, the re-render finds the data still missing
 * and throws a fresh load — which fails again at once. That was an unbounded
 * retry loop behind a "Loading…" that never ended and said nothing. So the
 * first failure is remembered, and every place that would suspend on a load
 * throws THIS instead (`throwIfLoadFailed`): a real error, which the app's
 * error boundary turns into a message and a Reload button. (Not an in-page
 * retry: the browser caches a failed dynamic import for the life of the page.)
 * Moving to another page clears it via `clearLoadFailure`, so that page's own
 * downloads are attempted.
 */
export class DataLoadFailedError extends Error {
  constructor(readonly reason: unknown) {
    super("Some of the league's data could not be downloaded.");
    this.name = "DataLoadFailedError";
  }
}

let loadFailure: DataLoadFailedError | null = null;

/** For a `.catch`: remember the first failure, and keep the rejection. */
export const recordFailure = (error: unknown): never => {
  loadFailure ??= new DataLoadFailedError(error);
  throw error;
};

/** Call before throwing a load for Suspense. See `DataLoadFailedError`. */
export const throwIfLoadFailed = (): void => {
  if (loadFailure) throw loadFailure;
};

/**
 * `all-time.json` keeps its own record. The narrative notes read it without
 * suspending, and a garnish that failed must not turn a later, perfectly
 * downloadable season read into an error — so only `usePrecomputedStats`,
 * which does suspend on it, consults this one.
 */
let precomputedFailure: unknown = null;

export const recordPrecomputedFailure = (error: unknown): never => {
  precomputedFailure = error;
  throw error;
};

export const forgetPrecomputedFailure = (): void => {
  precomputedFailure = null;
};

export const getPrecomputedFailure = (): unknown => precomputedFailure;

/** On navigation: let the next page attempt its own downloads. */
export const clearLoadFailure = (): void => {
  loadFailure = null;
  precomputedFailure = null;
};
