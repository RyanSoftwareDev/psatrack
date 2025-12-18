// app/api/aircraft/nearby/[icao]/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getOpenSkyToken } from "@/lib/openskyAuth";

export const runtime = "nodejs";

const memCache = new Map<string, { ts: number; payload: any }>();
const MEM_CACHE_MS = 6000; // UI polls ~5s

const AIRPORTS: Record<string, { icao: string; lat: number; lon: number }> = {
  SAV: { icao: "KSAV", lat: 32.1270, lon: -81.2020 },
  CLT: { icao: "KCLT", lat: 35.2140, lon: -80.9431 },
  DAY: { icao: "KDAY", lat: 39.9024, lon: -84.2194 },
  DFW: { icao: "KDFW", lat: 32.8998, lon: -97.0403 },
  PHL: { icao: "KPHL", lat: 39.8744, lon: -75.2424 },
};

type Ctx = { params: Promise<{ icao: string }> };

const DEFAULT_RADIUS_NM = 500;
const FRESH_TTL_MS = 15_000; // DB cache freshness window
const FETCH_TIMEOUT_MS = 9_000; // keep under serverless pain
const COOLDOWN_ON_FAIL_MS = 30_000;

function isPsaAircraft(a: { callsign?: string | null }): boolean {
  const cs = (a?.callsign ?? "").trim().toUpperCase();
  return cs.startsWith("JIA"); // PSA callsign prefix
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

async function readDbCache(base: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from("aircraft_cache")
    .select("*")
    .eq("base_code", base)
    .maybeSingle();
  return data ?? null;
}

async function writeDbCache(base: string, payload: any) {
  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin.from("aircraft_cache").upsert({
    base_code: base,
    updated_at: new Date().toISOString(),
    cooldown_until: null,
    payload,
  });
}

async function setCooldown(base: string, cachedPayload: any) {
  const supabaseAdmin = getSupabaseAdmin();
  const cooldownUntil = new Date(Date.now() + COOLDOWN_ON_FAIL_MS).toISOString();

  await supabaseAdmin.from("aircraft_cache").upsert({
    base_code: base,
    updated_at: new Date().toISOString(),
    cooldown_until: cooldownUntil,
    payload:
      cachedPayload ?? { airport: { code: base }, radiusNm: null, aircraft: [] },
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

  const cacheKey = `${key}:${radiusNm.toFixed(2)}`;

  // 0) small in-memory cache (reduces hammering)
  const mem = memCache.get(cacheKey);
  if (mem && Date.now() - mem.ts < MEM_CACHE_MS) {
    return NextResponse.json(mem.payload, {
      headers: { "Cache-Control": "s-maxage=5, stale-while-revalidate=10" },
    });
  }

  // 1) DB cache (Supabase)
  let dbCached: any = null;
  try {
    dbCached = await readDbCache(key);
  } catch {
    // ignore DB read issues, we’ll try OpenSky anyway
  }

  const now = Date.now();
  const dbUpdated = dbCached?.updated_at ? new Date(dbCached.updated_at).getTime() : 0;
  const dbIsFresh = !!dbCached && now - dbUpdated < FRESH_TTL_MS;

  const cooldownUntil = dbCached?.cooldown_until
    ? new Date(dbCached.cooldown_until).getTime()
    : 0;
  const inCooldown = cooldownUntil && now < cooldownUntil;

  // If DB cache is fresh or in cooldown, serve it immediately
  if ((dbIsFresh || inCooldown) && dbCached?.payload) {
    const filteredAircraft = Array.isArray(dbCached.payload?.aircraft)
      ? dbCached.payload.aircraft.filter(isPsaAircraft)
      : [];

    const payload = {
      ...dbCached.payload,
      aircraft: filteredAircraft,
      stale: !dbIsFresh,
      source: dbIsFresh ? "cache_fresh" : "cache_cooldown",
      updatedAt: dbCached.updated_at,
    };

    memCache.set(cacheKey, { ts: Date.now(), payload });
    return NextResponse.json(payload);
  }

  // 2) Live OpenSky fetch (OAuth)
  const { lamin, lomin, lamax, lomax } = bboxFromCenter(
    airport.lat,
    airport.lon,
    radiusNm
  );

  const openskyUrl =
    `https://opensky-network.org/api/states/all` +
    `?lamin=${encodeURIComponent(lamin)}` +
    `&lomin=${encodeURIComponent(lomin)}` +
    `&lamax=${encodeURIComponent(lamax)}` +
    `&lomax=${encodeURIComponent(lomax)}` +
    `&extended=1`;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response = await fetch(openskyUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": "psatrack/0.1 (contact: you)",
        Authorization: `Bearer ${await getOpenSkyToken()}`,
      },
    }).finally(() => clearTimeout(t));

    // Retry once on 401 (token issues)
    if (response.status === 401) {
      const controller2 = new AbortController();
      const t2 = setTimeout(() => controller2.abort(), FETCH_TIMEOUT_MS);

      response = await fetch(openskyUrl, {
        cache: "no-store",
        signal: controller2.signal,
        headers: {
          "User-Agent": "psatrack/0.1 (contact: you)",
          Authorization: `Bearer ${await getOpenSkyToken()}`,
        },
      }).finally(() => clearTimeout(t2));
    }

    if (!response.ok) {
      const fallbackRaw =
        dbCached?.payload ?? {
          airport: { code: key, ...airport },
          radiusNm,
          aircraft: [],
        };

      const fallback = {
        ...fallbackRaw,
        aircraft: Array.isArray(fallbackRaw.aircraft)
          ? fallbackRaw.aircraft.filter(isPsaAircraft)
          : [],
      };

      // Set cooldown so prod stops hammering
      try {
        await setCooldown(key, fallback);
      } catch {}

      const payload = {
        ...fallback,
        stale: true,
        source: `cache_http_${response.status}`,
        updatedAt: dbCached?.updated_at ?? null,
      };

      memCache.set(cacheKey, { ts: Date.now(), payload });
      return NextResponse.json(payload, { status: 200 });
    }

    const data = await response.json();
    const states: any[] = Array.isArray(data?.states) ? data.states : [];

    const aircraft = states
      .map((s) => {
        const icao24 = s?.[0] ?? null;
        const callsignRaw =
          typeof s?.[1] === "string" ? s[1].trim().toUpperCase() : "";
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

    // write-through cache
    try {
      await writeDbCache(key, payload);
    } catch {}

    memCache.set(cacheKey, { ts: Date.now(), payload });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "s-maxage=5, stale-while-revalidate=10" },
    });
  } catch {
    // timeout/connect fail — serve cached if possible + cooldown
    const fallbackRaw =
      dbCached?.payload ?? {
        airport: { code: key, ...airport },
        radiusNm,
        aircraft: [],
      };

    const fallback = {
      ...fallbackRaw,
      aircraft: Array.isArray(fallbackRaw.aircraft)
        ? fallbackRaw.aircraft.filter(isPsaAircraft)
        : [],
    };

    try {
      await setCooldown(key, fallback);
    } catch {}

    const payload = {
      ...fallback,
      stale: true,
      source: "cache_fetch_failed",
      updatedAt: dbCached?.updated_at ?? null,
    };

    memCache.set(cacheKey, { ts: Date.now(), payload });
    return NextResponse.json(payload, { status: 200 });
  }
}
