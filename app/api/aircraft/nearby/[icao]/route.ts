// app/api/aircraft/nearby/[icao]/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getOpenSkyToken } from "@/lib/openskyAuth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ icao: string }> };

const memCache = new Map<string, { ts: number; payload: any }>();
const MEM_CACHE_MS = 6_000;          // UI polls ~5s
const FRESH_TTL_MS = 3_000;          // treat DB as “fresh” for 3s
const FETCH_TIMEOUT_MS = 12_000;     // OpenSky should answer quickly
const COOLDOWN_ON_FAIL_MS = 10_000;  // avoid hammering when OpenSky fails
const DEFAULT_RADIUS_NM = 500;

const AIRPORTS: Record<string, { icao: string; lat: number; lon: number }> = {
  SAV: { icao: "KSAV", lat: 32.1270, lon: -81.2020 },
  CLT: { icao: "KCLT", lat: 35.2140, lon: -80.9431 },
  DAY: { icao: "KDAY", lat: 39.9024, lon: -84.2194 },
  DFW: { icao: "KDFW", lat: 32.8998, lon: -97.0403 },
  PHL: { icao: "KPHL", lat: 39.8744, lon: -75.2424 },
};

function isPsaAircraft(a: { callsign?: string | null }): boolean {
  const cs = (a?.callsign ?? "").trim().toUpperCase();
  return(
    cs.startsWith("JIA") ||     // PSA ICAO callsign
    cs.startsWith("AAL") ||     // American (sometimes appears)
    cs.startsWith("ASH") ||     // Mesa (example of regionals)
    cs.startsWith("ENY") ||     // Envoy
    cs.startsWith("PDT") ||     // Piedmont
    cs.startsWith("AWI")
  );
}

function nmToKm(nm: number) {
  return nm * 1.852;
}

function bboxFromCenter(lat: number, lon: number, radiusNm: number) {
  const rKm = nmToKm(radiusNm);
  const dLat = rKm / 111;
  const dLon = rKm / (111 * Math.cos((lat * Math.PI) / 180));

  return {
    lamin: lat - dLat,
    lamax: lat + dLat,
    lomin: lon - dLon,
    lomax: lon + dLon,
  };
}

function safeParsePayload(p: any): any | null {
  if (!p) return null;
  if (typeof p === "string") {
    try {
      return JSON.parse(p);
    } catch {
      return null;
    }
  }
  return p;
}

async function fetchWithTimeout(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers,
    });
  } finally {
    clearTimeout(t);
  }
}

async function readDbCache(base: string, radiusNm: number) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from("aircraft_cache")
    .select("*")
    .eq("base_code", base)
    .eq("radius_nm", radiusNm)
    .maybeSingle();

  return data ?? null;
}

async function writeDbCache(base: string, radiusNm: number, payload: any) {
  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin.from("aircraft_cache").upsert({
    base_code: base,
    radius_nm: radiusNm,
    updated_at: new Date().toISOString(),
    cooldown_until: null,
    payload, // JSONB preferred
  });
}

async function setCooldown(base: string, radiusNm: number, cachedPayload: any) {
  const supabaseAdmin = getSupabaseAdmin();
  const cooldownUntil = new Date(Date.now() + COOLDOWN_ON_FAIL_MS).toISOString();

  await supabaseAdmin.from("aircraft_cache").upsert({
    base_code: base,
    radius_nm: radiusNm,
    updated_at: new Date().toISOString(),
    cooldown_until: cooldownUntil,
    payload: cachedPayload ?? { airport: { code: base }, radiusNm, aircraft: [] },
  });
}

export async function GET(req: Request, { params }: Ctx) {
  const { icao } = await params;
  const key = (icao || "").toUpperCase().trim();
  const airport = AIRPORTS[key];

  if (!airport) {
    return NextResponse.json({ error: "Unknown airport" }, { status: 404 });
  }

  const url = new URL(req.url);
  const radiusNmRaw = Number(url.searchParams.get("radiusNm") ?? DEFAULT_RADIUS_NM);
  const radiusNm = Number.isFinite(radiusNmRaw) ? radiusNmRaw : DEFAULT_RADIUS_NM;

  const force = url.searchParams.get("force") === "1";
  const debug = url.searchParams.get("debug") === "1";

  const cacheKey = `${key}:${radiusNm.toFixed(2)}`;

  // 0) In-memory cache (skip when force=1)
  if (!force) {
    const mem = memCache.get(cacheKey);
    if (mem && Date.now() - mem.ts < MEM_CACHE_MS) {
      return NextResponse.json(mem.payload, {
        headers: { "Cache-Control": "s-maxage=5, stale-while-revalidate=10" },
      });
    }
  }

  // 1) DB cache (skip when force=1)
  let dbCached: any = null;
  let cachedPayload: any = null;

  if (!force) {
    try {
      dbCached = await readDbCache(key, radiusNm);
      cachedPayload = safeParsePayload(dbCached?.payload);
    } catch {
      dbCached = null;
      cachedPayload = null;
    }

    const now = Date.now();
    const dbUpdatedMs = dbCached?.updated_at ? new Date(dbCached.updated_at).getTime() : 0;
    const dbIsFresh = !!dbCached && now - dbUpdatedMs < FRESH_TTL_MS;

    const cooldownUntilMs = dbCached?.cooldown_until ? new Date(dbCached.cooldown_until).getTime() : 0;
    const inCooldown = !!cooldownUntilMs && now < cooldownUntilMs;

    const cacheMatchesRadius =
      typeof cachedPayload?.radiusNm === "number" &&
      Math.abs(cachedPayload.radiusNm - radiusNm) < 0.001;

    if (cachedPayload && cacheMatchesRadius && (dbIsFresh || inCooldown)) {
      const filteredAircraft = Array.isArray(cachedPayload.aircraft)
        ? cachedPayload.aircraft.filter(isPsaAircraft)
        : [];

      const payload = {
        ...cachedPayload,
        aircraft: filteredAircraft,
        stale: !dbIsFresh,
        source: dbIsFresh ? "cache_fresh" : "cache_cooldown",
        updatedAt: dbCached.updated_at,
      };

      memCache.set(cacheKey, { ts: Date.now(), payload });
      return NextResponse.json(payload);
    }
  }

  // Always load DB once for fallback (even when force=1)
  if (!dbCached) {
    try {
      dbCached = await readDbCache(key, radiusNm);
      cachedPayload = safeParsePayload(dbCached?.payload);
    } catch {
      dbCached = null;
      cachedPayload = null;
    }
  }

  // 2) OpenSky bbox fetch
  const { lamin, lomin, lamax, lomax } = bboxFromCenter(airport.lat, airport.lon, radiusNm);

  const openskyUrl =
    `https://opensky-network.org/api/states/all` +
    `?lamin=${encodeURIComponent(lamin)}` +
    `&lomin=${encodeURIComponent(lomin)}` +
    `&lamax=${encodeURIComponent(lamax)}` +
    `&lomax=${encodeURIComponent(lomax)}` +
    `&extended=1`;

  try {
    // Get token, call OpenSky
    const token = await getOpenSkyToken();
    let response = await fetchWithTimeout(openskyUrl, {
      "User-Agent": "psatrack/0.1 (contact: you)",
      Authorization: `Bearer ${token}`,
    });

    // Retry once on 401 with forced fresh token
    if (response.status === 401) {
      const fresh = await getOpenSkyToken({ forceRefresh: true });
      response = await fetchWithTimeout(openskyUrl, {
        "User-Agent": "psatrack/0.1 (contact: you)",
        Authorization: `Bearer ${fresh}`,
      });
    }

    if (debug) {
      const bodyText = await response.text().catch(() => "");
      return NextResponse.json({
        usingAuth: "bearer",
        openskyUrl,
        status: response.status,
        statusText: response.statusText,
        bodySnippet: bodyText.slice(0, 300),
      });
    }

    if (!response.ok) {
      const fallbackBase =
        cachedPayload ?? { airport: { code: key, ...airport }, radiusNm, aircraft: [] };

      const fallback = {
        ...fallbackBase,
        airport: { code: key, ...airport },
        radiusNm,
        aircraft: Array.isArray(fallbackBase.aircraft)
          ? fallbackBase.aircraft.filter(isPsaAircraft)
          : [],
      };

      if (!force) {
        try {
          await setCooldown(key, radiusNm, fallback);
        } catch {}
      }

      const payload = {
        ...fallback,
        stale: true,
        source: `opensky_http_${response.status}`,
        updatedAt: dbCached?.updated_at ?? null,
      };

      memCache.set(cacheKey, { ts: Date.now(), payload });
      return NextResponse.json(payload, { status: 200 });
    }

    const data = await response.json().catch(() => ({} as any));
    const states: any[] = Array.isArray(data?.states) ? data.states : [];

    const aircraft = states
      .map((s) => {
        const icao24 = s?.[0] ?? null;
        const callsignRaw = typeof s?.[1] === "string" ? s[1].trim().toUpperCase() : "";
        const lon = s?.[5];
        const lat = s?.[6];
        const onGround = !!s?.[8];
        const velocityMs = s?.[9] ?? null;
        const track = s?.[10] ?? null;
        const lastContact = s?.[4] ?? null;

        if (typeof lat !== "number" || typeof lon !== "number") return null;

        return {
          icao24,
          callsign: callsignRaw || null,
          lat,
          lon,
          onGround,
          velocity: velocityMs,
          track,
          lastContact,
          source: "opensky",
        };
      })
      .filter((a): a is NonNullable<typeof a> => !!a)
      .filter(isPsaAircraft);

    const payload = {
      airport: { code: key, ...airport },
      radiusNm,
      aircraft,
      stale: false,
      source: "opensky_live",
      updatedAt: new Date().toISOString(),
    };

    try {
      await writeDbCache(key, radiusNm, payload);
    } catch {}

    memCache.set(cacheKey, { ts: Date.now(), payload });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "s-maxage=5, stale-while-revalidate=10" },
    });
  } catch (err: any) {
    const fallbackBase =
      cachedPayload ?? { airport: { code: key, ...airport }, radiusNm, aircraft: [] };

    const fallback = {
      ...fallbackBase,
      airport: { code: key, ...airport },
      radiusNm,
      aircraft: Array.isArray(fallbackBase.aircraft)
        ? fallbackBase.aircraft.filter(isPsaAircraft)
        : [],
    };

    if (!force) {
      try {
        await setCooldown(key, radiusNm, fallback);
      } catch {}
    }

    const payload = {
      ...fallback,
      stale: true,
      source: "cache_fetch_failed",
      error: (err?.message ?? "unknown_error").toString().slice(0, 200),
      updatedAt: dbCached?.updated_at ?? null,
    };

    memCache.set(cacheKey, { ts: Date.now(), payload });
    return NextResponse.json(payload, { status: 200 });
  }
}