"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

const LayoutEditorMap = dynamic(
  () =>
    import("@/components/admin/LayoutEditorMap").then((m) => m.LayoutEditorMap),
  { ssr: false }
);

type LatLng = { lat: number; lon: number };

type Gate = {
  id: string;
  position: LatLng;
  notes?: string;
  preferredAircraft?: "CRJ7" | "CRJ9" | "ANY";
};

type AirportLayout = {
  center: LatLng;
  zoom?: number; // ✅ fixed
  gates: Gate[];
  runways: any[];
  taxiGraph: any[];
};

const [adminToken, setAdminToken] = useState<string>("");

useEffect(() => {
  if (process.env.NODE_ENV === "production") return;
  const t = window.prompt("Admin token:", "")?.trim() ?? "";
  setAdminToken(t);
}, []);

export default function LayoutEditorPage() {
  const [airportCode, setAirportCode] = useState("SAV");
  const [layout, setLayout] = useState<AirportLayout | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // one-step undo buffer
  const undoRef = useRef<AirportLayout | null>(null);

  if (process.env.NODE_ENV === "production") {
    return (
      <div className="p-6 text-red-400">
        Admin layout editor disabled in production.
      </div>
    );
  }

  useEffect(() => {
    async function load() {
      setStatus(null);
      setDirty(false);
      undoRef.current = null;

      const res = await fetch(`/api/airport-layout/${airportCode}`);
      if (!res.ok) {
        setLayout(null);
        setStatus(`Failed to load ${airportCode}`);
        return;
      }

      const json = await res.json();
      const raw = json.airport.layout;

      const parsed: AirportLayout =
        typeof raw === "string" ? JSON.parse(raw) : raw;

      // ensure defaults / shape
      parsed.zoom = typeof parsed.zoom === "number" ? parsed.zoom : 14;
      parsed.gates = parsed.gates || [];
      parsed.runways = parsed.runways || [];
      parsed.taxiGraph = parsed.taxiGraph || [];

      setLayout(parsed);
    }

    load();
  }, [airportCode]);

  function pushUndo(current: AirportLayout) {
    // deep clone so future edits don’t mutate undo
    undoRef.current = JSON.parse(JSON.stringify(current));
  }

  function undo() {
    if (!undoRef.current) return;
    setLayout(undoRef.current);
    undoRef.current = null;
    setDirty(true);
    setStatus("Undid last action");
  }

  async function saveLayout() {
    if (!layout) return;

    setStatus("Saving…");

    const res = await fetch(`/api/airport-layout/${airportCode}/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({ layout }),
    });

    if (res.ok) {
      setStatus("Saved ✔");
      setDirty(false);
      undoRef.current = null;
    } else {
      setStatus("Save failed");
    }
  }

  const gateIds = useMemo(
    () => new Set(layout?.gates.map((g) => g.id) ?? []),
    [layout]
  );

  if (!layout) {
    return <div className="p-6 text-slate-400">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6 text-white">
      <h1 className="text-xl font-semibold">Layout Editor (internal)</h1>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={airportCode}
          onChange={(e) => setAirportCode(e.target.value.toUpperCase())}
          className="rounded bg-slate-800 px-3 py-1"
        />

        <button onClick={saveLayout} className="rounded bg-blue-600 px-4 py-1">
          Save Layout
        </button>

        <button
          onClick={undo}
          disabled={!undoRef.current}
          className="rounded bg-slate-700 px-4 py-1 disabled:opacity-40"
          title="Undo last action"
        >
          Undo
        </button>

        {dirty && (
          <span className="text-xs text-amber-300">Unsaved changes</span>
        )}
        {status && <span className="text-sm">{status}</span>}
      </div>

      <LayoutEditorMap
        center={layout.center}
        zoom={layout.zoom ?? 14}
        gates={layout.gates}
        onZoomChange={(z) => {
          pushUndo(layout);
          setLayout({ ...layout, zoom: z });
          setDirty(true);
        }}
        onAddGate={(pos) => {
          pushUndo(layout);
          const id = String(layout.gates.length + 1);
          setLayout({
            ...layout,
            gates: [
              ...layout.gates,
              { id, position: pos, preferredAircraft: "ANY" },
            ],
          });
          setDirty(true);
        }}
        onMoveGate={(id, pos) => {
          pushUndo(layout);
          setLayout({
            ...layout,
            gates: layout.gates.map((g) =>
              g.id === id ? { ...g, position: pos } : g
            ),
          });
          setDirty(true);
        }}
        onRenameGate={(oldId, newId) => {
          const next = newId.trim().toUpperCase();
          if (!next) return;

          if (gateIds.has(next)) {
            setStatus(`Gate name "${next}" already exists.`);
            return;
          }

          pushUndo(layout);
          setLayout({
            ...layout,
            gates: layout.gates.map((g) =>
              g.id === oldId ? { ...g, id: next } : g
            ),
          });
          setDirty(true);
        }}
        onDeleteGate={(id) => {
          pushUndo(layout);
          setLayout({
            ...layout,
            gates: layout.gates.filter((g) => g.id !== id),
          });
          setDirty(true);
        }}
        onEditGateMeta={(id, patch) => {
          pushUndo(layout);
          setLayout({
            ...layout,
            gates: layout.gates.map((g) => (g.id === id ? { ...g, ...patch } : g)),
          });
          setDirty(true);
        }}
      />

      <p className="text-sm text-slate-400">
        Click map to add gates · Drag to move · Click to rename ·{" "}
        <b>Shift+Click</b> to edit notes/type · Right-click to delete
      </p>
    </div>
  );
}

//ffsf