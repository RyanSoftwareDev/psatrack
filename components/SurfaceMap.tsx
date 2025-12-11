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
  airportName: string;
};

export function SurfaceMap({ airportCode }: SurfaceMapProps) {
  const [layout, setLayout] = useState<AirportLayout | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch layout from /api/airport-layout/[airportCode]
  useEffect(() => {
    let cancelled = false;

    async function loadLayout() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/airport-layout/${airportCode}`);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const airport = (data as any).airport;
        if (!airport) {
          throw new Error("Malformed API response (missing airport)");
        }

        const raw = airport.layout;
        const parsed: AirportLayout =
          typeof raw === "string" ? JSON.parse(raw) : raw;

        if (!cancelled) {
          setLayout(parsed);
        }
      } catch (err) {
        console.error("Failed to load airport layout", err);
        if (!cancelled) {
          setError("Unable to load airport layout.");
          setLayout(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadLayout();

    return () => {
      cancelled = true;
    };
  }, [airportCode]);

  // ---- Loading / error / empty states ----

  if (loading && !layout) {
    return (
      <div className="flex h-[420px] items-center justify-center text-sm text-slate-500">
        Loading layout for {airportCode}…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[420px] items-center justify-center text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="flex h-[420px] items-center justify-center text-sm text-slate-500">
        No layout data found for {airportCode}.
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

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950/95">
      <AnyMapContainer
        center={center}
        zoom={14}
        scrollWheelZoom
        className="h-[420px] w-full"
      >
        <AnyTileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {/* Runways */}
        {layout.runways?.map((r) => (
          <AnyPolygon
            key={r.id}
            positions={r.outline.map(
              (pt) => [pt[0], pt[1]] as [number, number]
            )}
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
}
