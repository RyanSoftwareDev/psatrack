"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer as LeafletMapContainer,
  TileLayer as LeafletTileLayer,
  Polygon as LeafletPolygon,
  CircleMarker as LeafletCircleMarker,
  Tooltip as LeafletTooltip,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { matchAircraftToGates } from "@/lib/gateMatching";

// Loosen the types so TS stops complaining in Next 16
const AnyMapContainer = LeafletMapContainer as any;
const AnyTileLayer = LeafletTileLayer as any;
const AnyPolygon = LeafletPolygon as any;
const AnyCircleMarker = LeafletCircleMarker as any;
const AnyTooltip = LeafletTooltip as any;
const AnyMarker = LeafletMarker as any;
const AnyPolyline = LeafletPolyline as any;

// ---- Types that match the JSON we store in Supabase ----
type Runway = {
  id: string;
  outline: [number, number][]; // [lat, lon] pairs
};

type Gate = {
  id: string;
  position: { lat: number; lon: number };
};

type TaxiNode = {
  id: string;
  lat: number;
  lon: number;
};

type AirportLayout = {
  center: { lat: number; lon: number };
  runways: Runway[];
  gates: Gate[];
  taxiGraph: TaxiNode[];
};

type SurfaceMapProps = {
  airportCode: string;
  airportName?: string;
};

// ---- Trail + aircraft rendering helpers ----
type TrailPoint = { lat: number; lon: number; t: number };
type TrailMap = Record<string, TrailPoint[]>;

const MS_TO_KTS = 1.943844;
const TRAIL_MIN_KTS = 5;

const MAX_TRAIL_POINTS = 18; // tweak
const MAX_TRAIL_AGE_MS = 2 * 60_000; // 2 min
const MIN_MOVE_METERS = 25; // don’t add points unless it actually moved

function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * Small airplane SVG marker that points "up" by default.
 * We rotate the container to match track degrees.
 */
function makeAircraftIcon(trackDeg: number, onGround: boolean) {
  const size = onGround ? 20 : 26;
  const rotation = Number.isFinite(trackDeg) ? trackDeg : 0;

  const fill = onGround ? "rgba(168,85,247,0.95)" : "rgba(56,189,248,0.95)"; // matches your old colors
  const stroke = "rgba(15,23,42,0.95)";

  const html = `
    <div style="
      width:${size}px;height:${size}px;
      transform: rotate(${rotation}deg);
      transform-origin: 50% 50%;
      filter: drop-shadow(0 1px 1px rgba(0,0,0,0.35));
    ">
      <svg viewBox="0 0 64 64" width="${size}" height="${size}">
        <path
          d="M32 2 L40 22 L58 28 L58 36 L40 34 L36 62 L28 62 L24 34 L6 36 L6 28 L24 22 Z"
          fill="${fill}"
          stroke="${stroke}"
          stroke-width="2"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  `;

  return L.divIcon({
    className: "",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function SurfaceMap({ airportCode }: SurfaceMapProps) {
  const [layout, setLayout] = useState<AirportLayout | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"new-base" | "generic" | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [aircraft, setAircraft] = useState<any[]>([]);
  const [occupiedGateIds, setOccupiedGateIds] = useState<Set<string>>(new Set());

  const trailsRef = useRef<TrailMap>({});

  // ---- layout load ----
  useEffect(() => {
    if (!airportCode) return;

    let cancelled = false;

    async function loadLayout() {
      try {
        setLoading(true);
        setError(null);

        const code = airportCode.toUpperCase().trim();
        const res = await fetch(`/api/airport-layout/${code}`, { cache: "no-store" });

        if (!res.ok) {
          if (!cancelled) setError(res.status === 404 ? "new-base" : "generic");
          return;
        }

        const json = await res.json();

        // your API returns: { airport: { ..., layout: {...} } }
        const raw = json?.airport?.layout;
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

        if (!parsed?.center?.lat || !parsed?.center?.lon) {
          if (!cancelled) setError("new-base");
          return;
        }

        if (!cancelled) setLayout(parsed);
      } catch (e) {
        console.error("Layout load failed", e);
        if (!cancelled) setError("generic");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLayout();
    return () => {
      cancelled = true;
    };
  }, [airportCode]);

  const exitFullscreen = useCallback(() => setIsFullscreen(false), []);

  // ---- fullscreen esc + body scroll lock ----
  useEffect(() => {
    if (!isFullscreen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [isFullscreen]);

  // ---- aircraft polling ----
  useEffect(() => {
    if (!airportCode) return;

    let cancelled = false;

    async function loadAircraft() {
      try {
        const code = airportCode.toUpperCase().trim();

        // NOTE: keep your radius as you like (you had 500)
        const res = await fetch(`/api/aircraft/nearby/${code}?radiusNm=500`, {
          cache: "no-store",
        });
        if (!res.ok) return;

        const json = await res.json();
        const list = Array.isArray(json?.aircraft) ? json.aircraft : [];

        if (cancelled) return;

        setAircraft(list);

        // Gate occupancy
        const gates = layout?.gates ?? [];
        if (gates.length > 0) {
          const occ = matchAircraftToGates(list, gates);
          const occSet = new Set(occ.filter((o) => o.aircraft).map((o) => String(o.gateId)));
          setOccupiedGateIds(occSet);
        } else {
          setOccupiedGateIds(new Set());
        }
      } catch (e) {
        console.error("Aircraft load failed", e);
      }
    }

    loadAircraft();
    const t = setInterval(loadAircraft, 15000);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [airportCode, layout]);

  // ---- update trails when aircraft list updates ----
  useEffect(() => {
    const now = Date.now();

    for (const a of aircraft) {
      const key = (a?.icao24 || a?.callsign || "").toString().trim();
      if (!key) continue;

      const lat = a?.lat;
      const lon = a?.lon;
      if (typeof lat !== "number" || typeof lon !== "number") continue;

      const velMs = typeof a?.velocity === "number" ? a.velocity : 0;
      const kts = velMs * MS_TO_KTS;

      // Only maintain trails for moving aircraft
      if (kts <= TRAIL_MIN_KTS) {
        continue;
      }

      const prev = trailsRef.current[key] ?? [];
      const last = prev[prev.length - 1];
      const nextPoint: TrailPoint = { lat, lon, t: now };

      if (!last || metersBetween({ lat: last.lat, lon: last.lon }, { lat, lon }) >= MIN_MOVE_METERS) {
        trailsRef.current[key] = [...prev, nextPoint]
          .filter((p) => now - p.t <= MAX_TRAIL_AGE_MS)
          .slice(-MAX_TRAIL_POINTS);
      } else {
        // still prune old points
        trailsRef.current[key] = prev.filter((p) => now - p.t <= MAX_TRAIL_AGE_MS);
      }
    }

    // Cleanup trails not in current list
    const liveKeys = new Set(
      aircraft
        .map((a) => (a?.icao24 || a?.callsign || "").toString().trim())
        .filter(Boolean)
    );
    for (const k of Object.keys(trailsRef.current)) {
      if (!liveKeys.has(k)) delete trailsRef.current[k];
    }
  }, [aircraft]);

  // ---- UI states ----
  if (loading && !layout) {
    return (
      <div className="flex h-[420px] items-center justify-center text-sm text-slate-500">
        Loading layout for {airportCode.toUpperCase()}…
      </div>
    );
  }

  if (error === "new-base") {
    return (
      <div className="flex h-[420px] items-center justify-center text-sm text-slate-300">
        No layout saved yet for <span className="mx-1 font-mono">{airportCode.toUpperCase()}</span>.
      </div>
    );
  }

  if (error === "generic") {
    return (
      <div className="flex h-[420px] items-center justify-center text-sm text-red-400">
        Unable to load airport layout.
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="flex h-[420px] items-center justify-center text-sm text-slate-500">
        Select a base to view its surface layout.
      </div>
    );
  }

  const center: [number, number] = [layout.center.lat, layout.center.lon];

  // Basic styling for shapes
  const runwayStyle = {
    color: "#60a5fa",
    weight: 2,
    fillOpacity: 0.08,
  } as any;

  const freeGateStyle = {
    color: "#22c55e",
    weight: 1,
    fillOpacity: 0.9,
  } as any;

  const occupiedGateStyle = {
    color: "#ef4444",
    weight: 1,
    fillOpacity: 0.95,
  } as any;

  const taxiNodeStyle = {
    color: "#fbbf24",
    weight: 1,
    fillOpacity: 0.7,
  } as any;

  const trailStyle = {
    dashArray: "8 10",
    weight: 2,
    opacity: 0.8,
  } as any;

  const MapUI = (
    <div className="relative h-full w-full">
      {/* Fullscreen button (only in embedded mode) */}
      {!isFullscreen && (
        <button
          type="button"
          onClick={() => setIsFullscreen(true)}
          className="absolute right-3 top-3 z-[500] rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-medium text-slate-100 shadow hover:bg-slate-900"
          title="Fullscreen"
        >
          Full screen
        </button>
      )}

      <AnyMapContainer
        key={`${airportCode}-${isFullscreen ? "fs" : "normal"}`}
        center={center}
        zoom={14}
        scrollWheelZoom
        className="h-full w-full"
      >
        <AnyTileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {/* Runways */}
        {layout.runways?.map((r) => (
          <AnyPolygon
            key={r.id}
            positions={r.outline.map((pt) => [pt[0], pt[1]] as [number, number])}
            pathOptions={runwayStyle}
          />
        ))}

        {/* Gates */}
        {layout.gates?.map((g) => {
          const isOcc = occupiedGateIds.has(String(g.id));
          return (
            <AnyCircleMarker
              key={g.id}
              center={[g.position.lat, g.position.lon]}
              radius={4}
              pathOptions={isOcc ? occupiedGateStyle : freeGateStyle}
            >
              <AnyTooltip direction="top" offset={[0, -4]}>
                Gate {g.id} {isOcc ? "• Occupied" : "• Free"}
              </AnyTooltip>
            </AnyCircleMarker>
          );
        })}

        {/* Aircraft trails + aircraft icons */}
        {aircraft.map((a, idx) => {
          const lat = a?.lat;
          const lon = a?.lon;
          if (typeof lat !== "number" || typeof lon !== "number") return null;

          const key = (a?.icao24 ?? a?.callsign ?? `ac-${idx}`).toString();
          const callsign = (a?.callsign ?? a?.icao24 ?? "Aircraft").toString();

          const velMs = typeof a?.velocity === "number" ? a.velocity : 0;
          const kts = velMs * MS_TO_KTS;

          const onGround = !!a?.onGround;
          const track = typeof a?.track === "number" ? a.track : 0;

          const trail = trailsRef.current[key] ?? [];
          const showTrail = kts > TRAIL_MIN_KTS && trail.length >= 2;

          const icon = makeAircraftIcon(track, onGround);

          return (
            <div key={key}>
              {showTrail && (
                <AnyPolyline
                  positions={trail.map((p) => [p.lat, p.lon] as [number, number])}
                  pathOptions={trailStyle}
                />
              )}

              <AnyMarker position={[lat, lon]} icon={icon}>
                <AnyTooltip direction="top" offset={[0, -6]}>
                  {callsign}
                  {Number.isFinite(kts) ? ` • ${Math.round(kts)} kt` : ""}
                  {onGround ? " • GND" : ""}
                </AnyTooltip>
              </AnyMarker>
            </div>
          );
        })}

        {/* Taxi nodes */}
        {layout.taxiGraph?.map((node) => (
          <AnyCircleMarker
            key={node.id}
            center={[node.lat, node.lon]}
            radius={2}
            pathOptions={taxiNodeStyle}
          />
        ))}
      </AnyMapContainer>
    </div>
  );

  return (
    <>
      {/* Normal embedded map */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950/95">
        <div className="h-[420px] w-full">{MapUI}</div>
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/70"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) exitFullscreen();
          }}
        >
          <div className="absolute inset-3 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
            {/* Top bar */}
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="text-sm font-semibold text-slate-100">
                {airportCode.toUpperCase()} Surface Map
              </div>
              <button
                type="button"
                onClick={exitFullscreen}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-800"
                title="Exit (Esc)"
              >
                Exit
              </button>
            </div>

            {/* Fullscreen map area */}
            <div className="h-[calc(100%-52px)] w-full">{MapUI}</div>
          </div>
        </div>
      )}
    </>
  );
}