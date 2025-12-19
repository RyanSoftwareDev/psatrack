// app/api/aircraft/nearby/[icao]/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getOpenSkyToken } from "@/lib/openskyAuth"; // bearer method (your working one)

export const runtime = "nodejs";

type Ctx = { params: Promise<{ icao: string }> };

const AIRPORTS: Record<string, { icao: string; lat: number; lon: number }> = {
  SAV: { icao: "KSAV", lat: 32.1270, lon: -81.2020 },
  CLT: { icao: "KCLT", lat: 35.2140, lon: -80.9431 },
  DAY: { icao: "KDAY", lat: 39.9024, lon: -84.2194 },
  DFW: { icao: "KDFW", lat: 32.8998, lon: -97.0403 },
  PHL: { icao: "KPHL", lat: 39.8744, lon: -75.2424 },
};

const DEFAULT_RADIUS_NM = 55;

// --- “Best feel” thresholds (tune later) ---
const MS_TO_KTS = 1.9438444924406;

// Trails only when actually moving (your earlier request was > 5 kt)
const TRAIL_MIN_KTS = 5;

// When speed drops below this OR onGround=true → mark “landed”
const LANDED_MAX_KTS = 10;

// If we haven’t seen an aircraft for this long → mark “offline”
const OFFLINE_AFTER_SEC = 120;

// Don’t hammer OpenSky
const FETCH_TIMEOUT_MS = 12_000;

function isPsaCallsign(callsign?: string | null) {
  const cs = (callsign ?? "").trim().toUpperCase();
  return cs.startsWith("JIA");
}

function nmToKm(nm: number) {
  return nm * 1.852;
}

function bboxFromCenter(lat: number, lon: number, radiusNm: number) {
  const rKm = nmToKm(radiusNm);
  const dLat = rKm / 111;
  const dLon = rKm / (111 * Math.cos((lat * Math.PI) / 180));
  return { lamin: lat - dLat, lamax: lat + dLat, lomin: lon - dLon, lomax: lon + dLon };
}

async function fetchWithTimeout(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal, headers });
  } finally {
    clearTimeout(t);
  }
}

function isoFromOpenSkyLastContact(lastContact: any) {
  // OpenSky lastContact is usually unix seconds
  if (typeof lastContact === "number" && Number.isFinite(lastContact) && lastContact > 0) {
    return new Date(lastContact * 1000).toISOString();
  }
  return new Date().toISOString();
}

export async function GET(req: Request, { params }: Ctx) {
  const { icao } = await params;
  const key = (icao || "").toUpperCase().trim();
  const airport = AIRPORTS[key];
  if (!airport) return NextResponse.json({ error: "Unknown airport" }, { status: 404 });

  const url = new URL(req.url);
  const radiusNmRaw = Number(url.searchParams.get("radiusNm") ?? DEFAULT_RADIUS_NM);
  const radiusNm = Number.isFinite(radiusNmRaw) ? radiusNmRaw : DEFAULT_RADIUS_NM;

  const force = url.searchParams.get("force") === "1"; // bypass any future cache logic
  const debug = url.searchParams.get("debug") === "1";

  const { lamin, lomin, lamax, lomax } = bboxFromCenter(airport.lat, airport.lon, radiusNm);

  const openskyUrl =
    `https://opensky-network.org/api/states/all` +
    `?lamin=${encodeURIComponent(lamin)}` +
    `&lomin=${encodeURIComponent(lomin)}` +
    `&lamax=${encodeURIComponent(lamax)}` +
    `&lomax=${encodeURIComponent(lomax)}` +
    `&extended=1`;

  const supabaseAdmin = getSupabaseAdmin();

  try {
    // 1) Fetch OpenSky (Bearer token)
    const token = await getOpenSkyToken();
    const response = await fetchWithTimeout(openskyUrl, {
      "User-Agent": "psatrack/0.1 (contact: you)",
      Authorization: `Bearer ${token}`,
    });

    // Optional: debug “are we really hitting OpenSky?”
    if (debug) {
      const bodyText = await response.text().catch(() => "");
      return NextResponse.json({
        usingAuth: "bearer",
        openskyUrl,
        status: response.status,
        bodySnippet: bodyText.slice(0, 400),
      });
    }

    if (!response.ok) {
      // return current DB state if OpenSky fails
      const { data: latest } = await supabaseAdmin
        .from("aircraft_latest")
        .select("*")
        .eq("base_code", key)
        .order("last_seen", { ascending: false })
        .limit(250);

      return NextResponse.json({
        airport: { code: key, ...airport },
        radiusNm,
        aircraft: latest ?? [],
        stale: true,
        source: `opensky_http_${response.status}`,
        updatedAt: new Date().toISOString(),
      });
    }

    const data = await response.json();
    const states: any[] = Array.isArray(data?.states) ? data.states : [];

    // 2) Normalize → PSA only (JIA)
    const nowIso = new Date().toISOString();

    const normalized = states
      .map((s) => {
        const icao24 = s?.[0] ?? null;
        const callsignRaw = typeof s?.[1] === "string" ? s[1].trim().toUpperCase() : "";
        const lon = s?.[5];
        const lat = s?.[6];
        const onGround = !!s?.[8];
        const velMs = typeof s?.[9] === "number" ? s[9] : 0;
        const track = typeof s?.[10] === "number" ? s[10] : null;
        const lastContact = s?.[4];

        if (!icao24 || typeof lat !== "number" || typeof lon !== "number") return null;
        if (!isPsaCallsign(callsignRaw)) return null;

        const kts = velMs * MS_TO_KTS;

        const status =
          onGround || kts <= LANDED_MAX_KTS
            ? "landed"
            : "active";

        return {
          icao24: String(icao24),
          callsign: callsignRaw || null,
          lat,
          lon,
          track,
          onGround,
          ground_speed_kt: Number.isFinite(kts) ? kts : null,
          last_seen: isoFromOpenSkyLastContact(lastContact),
          status,
          source: "opensky",
          updated_at: nowIso,
          base_code: key,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    // 3) Write current snapshots (bulk upsert)
    // NOTE: aircraft_latest primary key is icao24
    if (normalized.length > 0) {
      await supabaseAdmin.from("aircraft_latest").upsert(
        normalized.map((a) => ({
          icao24: a.icao24,
          base_code: a.base_code,
          callsign: a.callsign,
          last_seen: a.last_seen,
          lat: a.lat,
          lon: a.lon,
          track: a.track,
          ground_speed_kt: a.ground_speed_kt,
          on_ground: a.onGround,
          status: a.status,
          source: a.source,
          updated_at: a.updated_at,
        })),
        { onConflict: "icao24" }
      );
    }

    // 4) Insert trail points (bulk) ONLY if moving > TRAIL_MIN_KTS
    // This keeps the DB smaller and matches your “trail only when speed > 5kt” rule.
    const trailRows = normalized
      .filter((a) => (a.ground_speed_kt ?? 0) > TRAIL_MIN_KTS)
      .map((a) => ({
        base_code: key,
        icao24: a.icao24,
        callsign: a.callsign,
        ts: a.last_seen, // keeps trail aligned with ADS-B time
        lat: a.lat,
        lon: a.lon,
        track: a.track,
        ground_speed_kt: a.ground_speed_kt,
        on_ground: a.onGround,
        source: "opensky",
      }));

    if (trailRows.length > 0) {
      await supabaseAdmin.from("aircraft_track_points").insert(trailRows);
    }

    // 5) Mark OFFLINE: anything not seen recently becomes offline
    // This is how you keep “landed/adsb-off” aircraft on the map in a different color.
    const cutoffIso = new Date(Date.now() - OFFLINE_AFTER_SEC * 1000).toISOString();

    await supabaseAdmin
      .from("aircraft_latest")
      .update({ status: "offline", updated_at: nowIso })
      .eq("base_code", key)
      .lt("last_seen", cutoffIso)
      .neq("status", "offline");

    // 6) Return “current state” from DB (fast + consistent)
    const { data: latest } = await supabaseAdmin
      .from("aircraft_latest")
      .select("*")
      .eq("base_code", key)
      .order("last_seen", { ascending: false })
      .limit(250);

    return NextResponse.json({
      airport: { code: key, ...airport },
      radiusNm,
      aircraft: latest ?? [],
      stale: false,
      source: "opensky_live",
      updatedAt: nowIso,
    });
  } catch (err: any) {
    // fallback: return DB state
    const { data: latest } = await supabaseAdmin
      .from("aircraft_latest")
      .select("*")
      .eq("base_code", key)
      .order("last_seen", { ascending: false })
      .limit(250);

    return NextResponse.json({
      airport: { code: key, ...airport },
      radiusNm,
      aircraft: latest ?? [],
      stale: true,
      source: "cache_fetch_failed",
      error: (err?.message ?? "unknown_error").toString().slice(0, 200),
      updatedAt: new Date().toISOString(),
    });
  }
}