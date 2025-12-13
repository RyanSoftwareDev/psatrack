"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

const LayoutEditorMap = dynamic(
  () =>
    import("@/components/admin/LayoutEditorMap").then((m) => m.LayoutEditorMap),
  { ssr: false }
);

type LatLng = { lat: number; lon: number };

type Gate = {
  id: string; // label
  position: LatLng;
};

type AirportLayout = {
  center: LatLng;
  gates: Gate[];
  runways: any[];
  taxiGraph: any[];
};

function makeUniqueGateId(desired: string, existingIds: Set<string>) {
  const base = desired.trim().toUpperCase();
  if (!base) return null;

  if (!existingIds.has(base)) return base;

  let i = 2;
  while (existingIds.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export default function LayoutEditorPage() {
  const [airportCode, setAirportCode] = useState("SAV");
  const [layout, setLayout] = useState<AirportLayout | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // IMPORTANT:
  // - You said this admin screen should NOT be on the public deployed site.
  // - Keep it dev-only.
  if (process.env.NODE_ENV === "production") {
    return (
      <div className="p-6 text-red-400">
        Admin layout editor disabled in production.
      </div>
    );
  }

  const ADMIN_LAYOUT_TOKEN =
    process.env.NEXT_PUBLIC_ADMIN_LAYOUT_TOKEN || "applesauce";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus(null);
      setLayout(null);
      setDirty(false);

      const res = await fetch(`/api/airport-layout/${airportCode.toUpperCase()}`);
      if (!res.ok) {
        setStatus(`Load failed (${res.status})`);
        return;
      }

      const json = await res.json();
      const raw = json.airport.layout;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

      if (!cancelled) setLayout(parsed);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [airportCode]);

  const gateIdSet = useMemo(() => {
    return new Set((layout?.gates ?? []).map((g) => g.id));
  }, [layout]);

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

    if (res.ok) {
      setStatus("Saved ✔");
      setDirty(false);
    } else {
      setStatus(`Save failed (${res.status})`);
    }
  }

  if (!layout) {
    return <div className="p-6 text-slate-400">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Layout Editor (internal)</h1>
        <div className="text-xs text-slate-400">
          {dirty ? "Unsaved changes" : "Saved"}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={airportCode}
          onChange={(e) => setAirportCode(e.target.value.toUpperCase())}
          className="rounded bg-slate-800 px-3 py-1"
          placeholder="SAV / CLT / DAY"
        />

        <button
          onClick={saveLayout}
          disabled={!dirty}
          className={`rounded px-4 py-1 ${
            dirty ? "bg-blue-600" : "bg-slate-700 opacity-60"
          }`}
        >
          Save Layout
        </button>

        {status && <span className="text-sm text-slate-300">{status}</span>}

        <span className="text-sm text-slate-400">
          Gates: {layout.gates.length}
        </span>
      </div>

<LayoutEditorMap
  center={layout.center}
  gates={layout.gates}
  onAddGate={(pos) => {
    const desired = window
      .prompt('Name this new gate (ex: 18, A12, B7):', "")
      ?.trim()
      .toUpperCase();

    if (!desired) return;

    // prevent duplicates (simple version)
    const existing = new Set(layout.gates.map((g) => g.id));
    let id = desired;
    if (existing.has(id)) {
      let i = 2;
      while (existing.has(`${desired}-${i}`)) i++;
      id = `${desired}-${i}`;
    }

    setLayout({
      ...layout,
      gates: [...layout.gates, { id, position: pos }],
    });
    setDirty(true);
  }}
  onMoveGate={(id, pos) => {
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
    if (!next || next === oldId) return;

    const existing = new Set(layout.gates.map((g) => g.id));
    existing.delete(oldId);

    let finalId = next;
    if (existing.has(finalId)) {
      let i = 2;
      while (existing.has(`${next}-${i}`)) i++;
      finalId = `${next}-${i}`;
    }

    setLayout({
      ...layout,
      gates: layout.gates.map((g) =>
        g.id === oldId ? { ...g, id: finalId } : g
      ),
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

      <div className="text-sm text-slate-400 space-y-1">
        <div>• Click map = add gate (you’ll name it)</div>
        <div>• Drag gate = reposition</div>
        <div>• Left click gate = rename</div>
        <div>• Right click gate = delete</div>
      </div>
    </div>
  );
}