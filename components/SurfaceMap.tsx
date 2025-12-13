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
    let cancelled = false;

    async function loadLayout() {
      setLoading(true);
      setError(null);
      setLayout(null); // ✅ prevents old base center from flashing

      try {
        const code = airportCode.toUpperCase().trim();
        const res = await fetch(`/api/airport-layout/${code}`);

        // 404 = normal "no layout yet"
        if (res.status === 404) {
          if (!cancelled) {
            setError("new-base");
            setLayout(null);
          }
          return;
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const airport = (data as any).airport;
        if (!airport) throw new Error("Malformed API response (missing airport)");

        const raw = airport.layout;
        const parsed: AirportLayout = typeof raw === "string" ? JSON.parse(raw) : raw;

        if (!parsed?.center?.lat || typeof parsed.center.lon !== "number") {
          throw new Error("Malformed layout JSON (missing center lat/lon)");
        }

        if (!cancelled) {
          setLayout(parsed);
          setError(null);
        }
      } catch (err) {
        console.error("Failed to load airport layout", err);
        if (!cancelled) {
          setError("generic");
          setLayout(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (airportCode) loadLayout();

    return () => {
      cancelled = true;
    };
  }, [airportCode]);

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

  const taxiNodeStyle = {
    color: "#fbbf24",
    weight: 1,
    fillOpacity: 0.7,
  } as any;

const MapUI = (
  <div className="relative h-full w-full">
    {/* Fullscreen button */}
    <button
      type="button"
      onClick={() => setIsFullscreen(true)}
      className="absolute right-3 top-3 z-[500] rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-medium text-slate-100 shadow hover:bg-slate-900"
      title="Fullscreen"
    >
      Full screen
    </button>

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
      {layout.gates?.map((g) => (
        <AnyCircleMarker
          key={g.id}
          center={[g.position.lat, g.position.lon]}
          radius={4}
          pathOptions={freeGateStyle}
        >
          <AnyTooltip direction="top" offset={[0, -4]}>
            Gate {g.id}
          </AnyTooltip>
        </AnyCircleMarker>
      ))}

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
