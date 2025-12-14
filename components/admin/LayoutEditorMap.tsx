"use client";

import "leaflet/dist/leaflet.css";
import L, { LeafletMouseEvent, Marker as LeafletMarkerType } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Tooltip,
  useMapEvents,
} from "react-leaflet";

export type LatLng = { lat: number; lon: number };

export type Gate = {
  id: string; // human label: "A12", "18", etc.
  position: LatLng;
  notes?: string;
  preferredAircraft?: "CRJ7" | "CRJ9" | "ANY";
};

export type Props = {
  center: LatLng;

  // ✅ NEW: persisted per-base zoom
  zoom: number;
  onZoomChange: (zoom: number) => void;

  gates: Gate[];
  onAddGate: (pos: LatLng) => void;
  onMoveGate: (id: string, pos: LatLng) => void;
  onRenameGate: (oldId: string, newId: string) => void;
  onDeleteGate: (id: string) => void;

  // ✅ NEW: edit notes/type
  onEditGateMeta: (
    id: string,
    patch: Partial<Pick<Gate, "notes" | "preferredAircraft">>
  ) => void;
};

function ClickToAddGate({ onAdd }: { onAdd: (pos: LatLng) => void }) {
  useMapEvents({
    click(e: LeafletMouseEvent) {
      onAdd({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

export function LayoutEditorMap({
  center,
  zoom,
  onZoomChange,
  gates,
  onAddGate,
  onMoveGate,
  onRenameGate,
  onDeleteGate,
  onEditGateMeta,
}: Props) {
  // A clean, modern “dot” marker
  const gateIcon = useMemo(() => {
    return L.divIcon({
      className: "",
      html: `
        <div style="
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: rgba(34,197,94,0.95);
          border: 2px solid rgba(255,255,255,0.85);
          box-shadow: 0 4px 10px rgba(0,0,0,0.35);
        "></div>
      `,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
  }, []);

  // Debounce zoom updates so we don't spam state on every wheel tick
  const zoomTimer = useRef<any>(null);
  const [internalZoom, setInternalZoom] = useState<number>(zoom);

  useEffect(() => setInternalZoom(zoom), [zoom]);

  function ZoomListener() {
    useMapEvents({
      zoomend(e) {
        const z = e.target.getZoom?.();
        if (typeof z !== "number") return;
        setInternalZoom(z);

        if (zoomTimer.current) clearTimeout(zoomTimer.current);
        zoomTimer.current = setTimeout(() => onZoomChange(z), 200);
      },
    });
    return null;
  }

  return (
    <MapContainer
      center={[center.lat, center.lon]}
      zoom={internalZoom}
      className="h-[520px] w-full rounded-xl"
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      <ZoomListener />
      <ClickToAddGate onAdd={onAddGate} />

      {gates.map((g) => (
        <Marker
          key={g.id}
          position={[g.position.lat, g.position.lon]}
          icon={gateIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target as LeafletMarkerType;
              const p = marker.getLatLng();
              onMoveGate(g.id, { lat: p.lat, lon: p.lng });
            },

            // Shift+Click = edit meta
            click: (e) => {
              const original = e.originalEvent as MouseEvent | undefined;
              const isShift = !!original?.shiftKey;

              if (isShift) {
                const notes = window.prompt(
                  `Notes for gate ${g.id} (blank clears):`,
                  g.notes ?? ""
                );
                if (notes === null) return; // cancelled

                const pref = window
                  .prompt(
                    `Preferred aircraft for ${g.id}: CRJ7 / CRJ9 / ANY`,
                    (g.preferredAircraft ?? "ANY").toUpperCase()
                  )
                  ?.trim()
                  .toUpperCase();

                const preferredAircraft =
                  pref === "CRJ7" || pref === "CRJ9" || pref === "ANY"
                    ? (pref as Gate["preferredAircraft"])
                    : g.preferredAircraft ?? "ANY";

                onEditGateMeta(g.id, {
                  notes: notes.trim() ? notes : undefined,
                  preferredAircraft,
                });
                return;
              }

              // normal click = rename
              const next = window
                .prompt("Rename gate:", g.id)
                ?.trim()
                .toUpperCase();
              if (!next || next === g.id) return;
              onRenameGate(g.id, next);
            },

            // Right click = delete
            contextmenu: () => {
              const ok = window.confirm(`Delete gate "${g.id}"?`);
              if (!ok) return;
              onDeleteGate(g.id);
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
            Gate {g.id}
            {g.preferredAircraft && g.preferredAircraft !== "ANY"
              ? ` · ${g.preferredAircraft}`
              : ""}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}