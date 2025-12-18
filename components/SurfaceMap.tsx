"use client";

import { useEffect, useState } from "react";
import {
  MapContainer as LeafletMapContainer,
  TileLayer as LeafletTileLayer,
  Polygon as LeafletPolygon,
  CircleMarker as LeafletCircleMarker,
  Tooltip as LeafletTooltip,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback } from "react";
import { matchAircraftToGates } from "@/lib/gateMatching";


// Loosen the types so TS stops complaining in Next 16
const AnyMapContainer = LeafletMapContainer as any;
const AnyTileLayer = LeafletTileLayer as any;
const AnyPolygon = LeafletPolygon as any;
const AnyCircleMarker = LeafletCircleMarker as any;
const AnyTooltip = LeafletTooltip as any;

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

export function SurfaceMap({ airportCode }: SurfaceMapProps) {
  const [layout, setLayout] = useState<AirportLayout | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"new-base" | "generic" | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
    const [aircraft, setAircraft] = useState<any[]>([]);
  const [occupiedGateIds, setOccupiedGateIds] = useState<Set<string>>(new Set());

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

useEffect(() => {
  if (!isFullscreen) return;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") setIsFullscreen(false);
  };

  document.addEventListener("keydown", onKeyDown);
  // Prevent background scroll while fullscreen
  document.body.style.overflow = "hidden";

  return () => {
    document.removeEventListener("keydown", onKeyDown);
    document.body.style.overflow = "";
  };
}, [isFullscreen]);


useEffect(() => {
  if (!airportCode) return;

  let cancelled = false;

  async function loadAircraft() {
    try {
      const code = airportCode.toUpperCase().trim();
      const res = await fetch(`/api/aircraft/nearby/${code}?radiusNm=500`, {
        cache: "no-store",
      });
      if (!res.ok) return;

      const json = await res.json();
      const list = Array.isArray(json?.aircraft) ? json.aircraft : [];

      if (cancelled) return;

      setAircraft(list);

      // Only compute gate occupancy if gates exist
      const gates = layout?.gates ?? [];
      if (gates.length > 0) {
        const occ = matchAircraftToGates(list, gates);
        const occSet = new Set(
          occ.filter((o) => o.aircraft).map((o) => String(o.gateId))
        );
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

  const aircraftAirStyle = {
    color: "#38bdf8",
    weight: 1,
    fillOpacity: 0.9,
  } as any;

  const aircraftGroundStyle = {
    color: "#a855f7",
    weight: 1,
    fillOpacity: 0.95,
  } as any;


  const taxiNodeStyle = {
    color: "#fbbf24",
    weight: 1,
    fillOpacity: 0.7,
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

      {/* Aircraft */}
      {aircraft.map((a, idx) => {
        const lat = a?.lat;
        const lon = a?.lon;
        if (typeof lat !== "number" || typeof lon !== "number") return null;

        const speed = typeof a?.velocity === "number" ? a.velocity : null; // m/s
        const onGround = !!a?.onGround;

        return (
          <AnyCircleMarker
            key={a?.icao24 ?? a?.callsign ?? `ac-${idx}`}
            center={[lat, lon]}
            radius={3}
            pathOptions={onGround ? aircraftGroundStyle : aircraftAirStyle}
          >
            <AnyTooltip direction="top" offset={[0, -4]}>
              {a?.callsign ?? a?.icao24 ?? "Aircraft"}
              {speed != null ? ` • ${(speed * 1.94384).toFixed(0)} kt` : ""}
              {onGround ? " • GND" : ""}
            </AnyTooltip>
          </AnyCircleMarker>
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
          // clicking the backdrop closes
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
