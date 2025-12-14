"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useMemo } from "react";
import {
  MapContainer as LeafletMapContainer,
  TileLayer as LeafletTileLayer,
  Marker as LeafletMarker,
  Tooltip as LeafletTooltip,
  useMapEvents,
} from "react-leaflet";

const MapContainer = LeafletMapContainer as any;
const TileLayer = LeafletTileLayer as any;
const Marker = LeafletMarker as any;
const Tooltip = LeafletTooltip as any;

export type LatLng = { lat: number; lon: number };

export type Gate = {
  id: string;
  position: LatLng;
  notes?: string;
  preferredAircraft?: "CRJ7" | "CRJ9" | "ANY";
};

export type Props = {
  center: LatLng;
  gates: Gate[];

  onAddGate: (pos: LatLng) => void;
  onMoveGate: (id: string, pos: LatLng) => void;
  onRenameGate: (oldId: string, newId: string) => void;
  onDeleteGate: (id: string) => void;

  onEditGateMeta: (id: string, patch: Partial<Pick<Gate, "notes" | "preferredAircraft">>) => void;
};

function ClickToAddGate({ onAdd }: { onAdd: (pos: LatLng) => void }) {
  useMapEvents({
    click(e: any) {
      onAdd({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

export function LayoutEditorMap({
  center,
  gates,
  onAddGate,
  onMoveGate,
  onRenameGate,
  onDeleteGate,
  onEditGateMeta,
}: Props) {
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

  function normalizePreferred(v?: string | null): Gate["preferredAircraft"] | undefined {
    const s = (v || "").trim().toUpperCase();
    if (!s) return undefined;
    if (s === "CRJ7" || s === "CRJ-700" || s === "700") return "CRJ7";
    if (s === "CRJ9" || s === "CRJ-900" || s === "900") return "CRJ9";
    if (s === "ANY") return "ANY";
    return undefined;
  }

  return (
    <MapContainer
      center={[center.lat, center.lon]}
      zoom={14}
      className="h-[520px] w-full rounded-xl"
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      <ClickToAddGate onAdd={onAddGate} />

      {gates.map((g) => (
        <Marker
          key={g.id}
          position={[g.position.lat, g.position.lon]}
          icon={gateIcon}
          draggable
          eventHandlers={{
            dragend: (e: any) => {
              const p = e.target.getLatLng();
              onMoveGate(g.id, { lat: p.lat, lon: p.lng });
            },

            // Click behavior:
            // - Shift+Click = edit metadata
            // - Click = rename
            click: (e: any) => {
              const isShift = !!e?.originalEvent?.shiftKey;

              if (isShift) {
                const prefRaw = window.prompt(
                  `Preferred aircraft for gate "${g.id}"? (CRJ7 / CRJ9 / ANY)\n(leave blank = no preference)`,
                  g.preferredAircraft || ""
                );
                const preferredAircraft = normalizePreferred(prefRaw);

                const notesRaw = window.prompt(
                  `Notes for gate "${g.id}"? (optional)`,
                  g.notes || ""
                );
                const notes = (notesRaw ?? "").trim();

                onEditGateMeta(g.id, {
                  preferredAircraft: preferredAircraft ?? undefined,
                  notes: notes || undefined,
                });
                return;
              }

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
            <div style={{ lineHeight: 1.15 }}>
              <div><b>Gate {g.id}</b></div>
              {g.preferredAircraft && <div>Pref: {g.preferredAircraft}</div>}
              {g.notes && <div>Notes: {g.notes}</div>}
            </div>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}