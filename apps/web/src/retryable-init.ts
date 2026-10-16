/**
 * Memoize an async initializer, but forget a failed attempt.
 *
 * Concurrent callers share one in-flight attempt, and a successful attempt is
 * reused forever. If the attempt rejects (e.g. a transient fetch failure), the
 * cached promise is dropped so the next call retries instead of re-awaiting the
 * same rejected promise forever.
 *
 * Kept WASM-free so it can be unit tested without building the engine; used by
 * `workers/iss-passes-worker.ts`.
 */
export function retryableInit<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (pending) return pending;
    // Wrap so a synchronous throw from `fn` also becomes a (retryable) rejection.
    const attempt = (async () => fn())();
    pending = attempt;
    attempt.catch(() => {
      if (pending === attempt) pending = null;
    });
    return attempt;
  };
}
