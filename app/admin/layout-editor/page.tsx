"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { Gate, LatLng } from "@/components/admin/LayoutEditorMap";

const LayoutEditorMap = dynamic(
  () => import("@/components/admin/LayoutEditorMap").then((m) => m.LayoutEditorMap),
  { ssr: false }
);

type AirportLayout = {
  center: LatLng;
  gates: Gate[];
  runways: any[];
  taxiGraph: any[];
  zoom?: number;
};

const ADMIN_LAYOUT_TOKEN = "applesauce";

export default function LayoutEditorPage() {
  const [airportCode, setAirportCode] = useState("SAV");
  const [layout, setLayout] = useState<AirportLayout | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // keep your local safety switch
  if (process.env.NODE_ENV === "production") {
    return (
      <div className="p-6 text-red-400">
        Admin layout editor disabled in production.
      </div>
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus(null);
      setDirty(false);
      setLayout(null);

      const res = await fetch(`/api/airport-layout/${airportCode.toUpperCase()}`);
      if (!res.ok) {
        if (!cancelled) setStatus("Load failed");
        return;
      }

      const json = await res.json();
      const raw = json.airport.layout;
      const parsed: AirportLayout = typeof raw === "string" ? JSON.parse(raw) : raw;

      if (!cancelled) setLayout(parsed);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [airportCode]);

  async function saveLayout() {
    if (!layout) return;

    setStatus("Saving…");

    const res = await fetch(`/api/airport-layout/${airportCode}/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": ADMIN_LAYOUT_TOKEN,
      },
      body: JSON.stringify({ layout }),
    });

    setStatus(res.ok ? "Saved ✔" : "Save failed");
    if (res.ok) setDirty(false);
  }

  const title = useMemo(() => `Layout Editor (internal)`, []);

  if (!layout) {
    return <div className="p-6 text-slate-400">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6 text-white">
      <h1 className="text-xl font-semibold">{title}</h1>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={airportCode}
          onChange={(e) => setAirportCode(e.target.value.toUpperCase())}
          className="rounded bg-slate-800 px-3 py-1"
          placeholder="SAV / CLT / DAY"
        />

        <button
          onClick={saveLayout}
          className="rounded bg-blue-600 px-4 py-1"
        >
          Save Layout
        </button>

        {dirty && (
          <span className="text-sm text-yellow-300">
            Unsaved changes
          </span>
        )}

        {status && <span className="text-sm">{status}</span>}
      </div>

      <LayoutEditorMap
        center={layout.center}
        gates={layout.gates}
        onAddGate={(pos) => {
          const nextId = String(layout.gates.length + 1);
          setLayout({
            ...layout,
            gates: [...layout.gates, { id: nextId, position: pos }],
          });
          setDirty(true);
        }}
        onMoveGate={(id, pos) => {
          setLayout({
            ...layout,
            gates: layout.gates.map((g) => (g.id === id ? { ...g, position: pos } : g)),
          });
          setDirty(true);
        }}
        onRenameGate={(oldId, newId) => {
          // prevent duplicates
          if (layout.gates.some((g) => g.id === newId)) {
            alert(`Gate "${newId}" already exists.`);
            return;
          }
          setLayout({
            ...layout,
            gates: layout.gates.map((g) => (g.id === oldId ? { ...g, id: newId } : g)),
          });
          setDirty(true);
        }}
        onDeleteGate={(id) => {
          setLayout({
            ...layout,
            gates: layout.gates.filter((g) => g.id !== id),
          });
          setDirty(true);
        }}
      />

      <p className="text-sm text-slate-400">
        Click map to add gates · drag to move · click to rename · right click to delete · Save writes to DB
      </p>
    </div>
  );
}