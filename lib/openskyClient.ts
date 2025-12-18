// lib/openskyClient.ts
type OpenSkyAircraft = {
  icao24: string | null;
  callsign: string | null;
  lat: number;
  lon: number;
  onGround: boolean;
  velocity: number | null; // m/s
  track: number | null;
  lastContact: number | null;
  source: "opensky";
};

type OpenSkyNearbyResponse = {
  airport: { code: string; icao: string; lat: number; lon: number };
  radiusNm: number;
  aircraft: OpenSkyAircraft[];
};

type CacheEntry = {
  value: OpenSkyNearbyResponse;
  fetchedAtMs: number;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<OpenSkyNearbyResponse>>();
const backoffUntilMs = new Map<string, number>();

const CACHE_TTL_MS = 8_000;           // fresh cache window
const STALE_MAX_MS = 5 * 60_000;      // how long we'll serve stale on errors
const BASE_BACKOFF_MS = 10_000;       // after 429/5xx, pause briefly
const MAX_BACKOFF_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

function now() {
  return Date.now();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isFresh(entry: CacheEntry) {
  return now() - entry.fetchedAtMs <= CACHE_TTL_MS;
}

function isStaleOk(entry: CacheEntry) {
  return now() - entry.fetchedAtMs <= STALE_MAX_MS;
}

function computeBackoff(prevMs?: number) {
  if (!prevMs) return BASE_BACKOFF_MS;
  return clamp(prevMs * 2, BASE_BACKOFF_MS, MAX_BACKOFF_MS);
}

function normalizeStatesToAircraft(states: any[]): OpenSkyAircraft[] {
  return (Array.isArray(states) ? states : [])
    .map((s) => {
      const icao24 = s?.[0] ?? null;
      const callsign = (s?.[1] ?? "").trim() || null;
      const lon = s?.[5];
      const lat = s?.[6];
      const onGround = !!s?.[8];
      const velocityMs = s?.[9] ?? null;
      const track = s?.[10] ?? null;
      const lastContact = s?.[4] ?? null;

      if (typeof lat !== "number" || typeof lon !== "number") return null;

      return {
        icao24,
        callsign,
        lat,
        lon,
        onGround,
        velocity: typeof velocityMs === "number" ? velocityMs : null,
        track: typeof track === "number" ? track : null,
        lastContact: typeof lastContact === "number" ? lastContact : null,
        source: "opensky" as const,
      };
    })
    .filter((x): x is OpenSkyAircraft => x !== null);
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "psatrack/0.1 (contact: you)" },
    });
  } finally {
    clearTimeout(t);
  }
}

export async function getOpenSkyNearbyCached(opts: {
  cacheKey: string; // include airport+radius+box
  openskyUrl: string;
  buildResponse: (aircraft: OpenSkyAircraft[]) => OpenSkyNearbyResponse;
}): Promise<{ data: OpenSkyNearbyResponse; meta: { hit: "fresh" | "stale" | "miss"; usedStale: boolean } }> {
  const { cacheKey, openskyUrl, buildResponse } = opts;

  const entry = cache.get(cacheKey);

  // 1) fresh cache: return immediately
  if (entry && isFresh(entry)) {
    return { data: entry.value, meta: { hit: "fresh", usedStale: false } };
  }

  // 2) if we are currently backing off, serve stale if we can
  const boUntil = backoffUntilMs.get(cacheKey) ?? 0;
  if (boUntil > now()) {
    if (entry && isStaleOk(entry)) {
      return { data: entry.value, meta: { hit: "stale", usedStale: true } };
    }
    // no stale available — we'll still try once inflight logic below
  }

  // 3) in-flight dedupe
  const existing = inflight.get(cacheKey);
  if (existing) {
    const data = await existing;
    return { data, meta: { hit: entry ? "stale" : "miss", usedStale: false } };
  }

  const p = (async () => {
    try {
      const res = await fetchWithTimeout(openskyUrl);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // set / extend backoff on rate limit or server errors
        if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
          const prev = backoffUntilMs.get(cacheKey);
          const prevWindow = prev ? prev - now() : undefined;
          const nextWindow = computeBackoff(prevWindow);
          backoffUntilMs.set(cacheKey, now() + nextWindow);
        }

        // serve stale if possible
        if (entry && isStaleOk(entry)) {
          return entry.value;
        }

        // otherwise throw a controlled error
        throw Object.assign(new Error("OpenSky fetch failed"), {
          status: res.status,
          detail: text.slice(0, 200),
        });
      }

      const json = await res.json();
      const aircraft = normalizeStatesToAircraft(json?.states ?? []);
      const built = buildResponse(aircraft);

      cache.set(cacheKey, { value: built, fetchedAtMs: now() });
      // success -> clear backoff
      backoffUntilMs.delete(cacheKey);

      return built;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, p);

  try {
    const data = await p;
    return { data, meta: { hit: entry ? "stale" : "miss", usedStale: false } };
  } catch (err: any) {
    // final fallback: if anything weird happens, still try stale
    if (entry && isStaleOk(entry)) {
      return { data: entry.value, meta: { hit: "stale", usedStale: true } };
    }
    throw err;
  }
}
