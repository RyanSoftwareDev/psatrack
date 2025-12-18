import { NextResponse } from "next/server";

const memCache = new Map<string, { ts: number; payload: any }>();
const CACHE_MS = 6000; //~6S; Ui polls at 5s safely.



export const runtime = "nodejs";

const AIRPORTS: Record<string, { icao: string; lat: number; lon: number }> = {
  SAV: { icao: "KSAV", lat: 32.1270, lon: -81.2020 },
  CLT: { icao: "KCLT", lat: 35.2140, lon: -80.9431 },
  DAY: { icao: "KDAY", lat: 39.9024, lon: -84.2194 },
  DFW: { icao: "KDFW", lat: 32.8998, lon: -97.0403 },
  PHL: { icao: "KPHL", lat: 39.8744, lon: -75.2424 },
};

type Ctx = { params: Promise<{ icao: string }> };

// Keep this small so we don’t hammer the API.
const DEFAULT_RADIUS_NM = 1200; // tweak as you like

function nmToKm(nm: number) {
  return nm * 1.852;
}

function bboxFromCenter(lat: number, lon: number, radiusNm: number) {
  const rKm = nmToKm(radiusNm);
  const dLat = rKm / 111; // ~km per degree latitude
  const dLon = rKm / (111 * Math.cos((lat * Math.PI) / 180)); // adjust for longitude
  return {
    lamin: lat - dLat,
    lamax: lat + dLat,
    lomin: lon - dLon,
    lomax: lon + dLon,
  };
}

export async function GET(req: Request, { params }: Ctx) {
  const { icao } = await params;
  const key = (icao || "").toUpperCase();
  const airport = AIRPORTS[key];

  if (!airport) {
    return NextResponse.json({ error: "Unknown airport" }, { status: 404 });
  }

  const url = new URL(req.url);
  const radiusNm = Number(url.searchParams.get("radiusNm") ?? DEFAULT_RADIUS_NM);

  const { lamin, lomin, lamax, lomax } = bboxFromCenter(
    airport.lat,
    airport.lon,
    Number.isFinite(radiusNm) ? radiusNm : DEFAULT_RADIUS_NM
  );

  // OpenSky: https://opensky-network.org/api/states/all?lamin=...&lomin=...&lamax=...&lomax=...
  // (All State Vectors + bounding box params) 
  const openskyUrl =
    `https://opensky-network.org/api/states/all` +
    `?lamin=${encodeURIComponent(lamin)}` +
    `&lomin=${encodeURIComponent(lomin)}` +
    `&lamax=${encodeURIComponent(lamax)}` +
    `&lomax=${encodeURIComponent(lomax)}` +
    `&extended=1`;

const cacheKey = `${key}:${radiusNm.toFixed(2)}`;
const cached = memCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_MS) {
    return NextResponse.json(cached.payload, {
        headers: { "Cache-Control": "s-maxage=5, stale-while-revalidate=10"},
    });
  }

  // OPTIONAL (later): add auth headers/token if you set up OpenSky OAuth client.
  // For now we’ll run anonymous.
  const res = await fetch(openskyUrl, {
    // Avoid caching surprises in dev/prod
    cache: "no-store",
    headers: {
      "User-Agent": "psatrack/0.1 (contact: you)",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: "OpenSky fetch failed", status: res.status, detail: text.slice(0, 200) },
      { status: 502 }
    );
  }

  const data = await res.json();

  // OpenSky returns `states` as a 2D array. Index mapping is in their docs. 
  const states: any[] = Array.isArray(data?.states) ? data.states : [];

  const aircraft = states
    .map((s) => {
      // indices from OpenSky docs:
      // 0 icao24, 1 callsign, 5 lon, 6 lat, 7 baro_alt(m), 8 on_ground, 9 velocity(m/s), 10 track, 4 last_contact
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
        velocity: velocityMs, // m/s (keep raw for now)
        track,
        lastContact,
        source: "opensky",
      };
    })
    .filter(Boolean);

    const payload = {
  airport: { code: key, ...airport },
  radiusNm: Number.isFinite(radiusNm) ? radiusNm : DEFAULT_RADIUS_NM,
  aircraft,
};

memCache.set(cacheKey, { ts: Date.now(), payload });

return NextResponse.json(payload, {
  headers: { "Cache-Control": "s-maxage=5, stale-while-revalidate=10" },
});

}
