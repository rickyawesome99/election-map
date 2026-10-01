"use client";

import { useEffect, useState } from "react";

// One in-flight/settled promise per URL, shared across every mount for the life of the tab,
// so re-selecting a slice never refetches and two mounts never race. Failures are dropped
// from the cache so a later mount retries.
const cache = new Map<string, Promise<unknown>>();

export function loadStaticJson<T>(url: string): Promise<T> {
  const cached = cache.get(url);
  if (cached) return cached as Promise<T>;
  const promise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
      return res.json() as Promise<T>;
    })
    .catch((err) => {
      cache.delete(url);
      throw err;
    });
  cache.set(url, promise);
  return promise;
}

/**
 * A build-time JSON slice (an `app/api/**` route with `dynamic = "force-static"`), fetched on
 * demand. `url` null keeps the request off the wire until the reader actually needs the data.
 * The result is stored WITH the url it belongs to, so a change of selection never shows the
 * previous selection's data for the render between the change and the new fetch resolving.
 */
export function useStaticJson<T>(url: string | null, initial?: { url: string; data: T } | null) {
  const [loaded, setLoaded] = useState<{ url: string; data: T } | null>(initial ?? null);
  const [failedFor, setFailedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    if (initial && initial.url === url) return;
    let active = true;
    loadStaticJson<T>(url).then(
      (data) => active && setLoaded({ url, data }),
      () => active && setFailedFor(url),
    );
    return () => {
      active = false;
    };
  }, [url, initial]);

  // The server-rendered slice serves its url directly: the effect skips fetching it, so after
  // switching away and back, `loaded` still holds the other selection's data.
  const data = !url ? null : loaded?.url === url ? loaded.data : initial?.url === url ? initial.data : null;
  const failed = failedFor === url;
  return { data, loading: !!url && !data && !failed, failed };
}
