"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

// Load SurfaceMap only in the browser (no SSR)
const SurfaceMap = dynamic(
  () => import("@/components/SurfaceMap").then((m) => m.SurfaceMap),
  { ssr: false }
);

// Simple type for what the API returns
type AirportLayout = {
  airport_code: string;
  name?: string | null;
  icao_code?: string | null;
  iata_code?: string | null;
  layout: {
    center?: { lat: number; lon: number };
    runways?: any[];
    gates?: any[];
    taxiGraph?: any[];
  };
};

type BaseOption = {
  code: string;
  icao: string;
  label: string;
  hub: boolean;
};

const PSA_BASES: BaseOption[] = [
  { code: "SAV", icao: "KSAV", label: "Savannah / Hilton Head", hub: false },
  { code: "CLT", icao: "KCLT", label: "Charlotte", hub: true },
  { code: "DAY", icao: "KDAY", label: "Dayton", hub: true },
  { code: "DFW", icao: "KDFW", label: "Dallas/Fort Worth", hub: false },
  { code: "PHL", icao: "KPHL", label: "Philadelphia", hub: true },
];

const LOCAL_STORAGE_KEY = "psatrack.currentBase";

function getInitialBaseCode(): string {
  if (typeof window === "undefined") return "SAV";
  try {
    const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored && /^[A-Z]{3,4}$/.test(stored)) {
      return stored;
    }
  } catch {
    // ignore
  }
  return "SAV";
}

export default function DashboardPage() {
  const [currentBase, setCurrentBase] = useState<string>("SAV");
  const [airport, setAirport] = useState<AirportLayout | null>(null);
  const [loadingAirport, setLoadingAirport] = useState(false);
  const [airportError, setAirportError] = useState<string | null>(null);
  const [occupancy, setOccupancy] = useState<any[]>([]);

  useEffect(() => {
  if (!airport?.layout?.gates) return;

  async function loadOccupancy() {
    try {
      const [layoutRes, airRes] = await Promise.all([
        fetch(`/api/airport-layout/${currentBase}`),
        fetch(`/api/aircraft/nearby/${currentBase}`),
      ]);

      if (!layoutRes.ok || !airRes.ok) return;

      const layoutJson = await layoutRes.json();
      const aircraftJson = await airRes.json();

      const layout = layoutJson.airport.layout;
      const aircraft = aircraftJson.aircraft;

      const { matchAircraftToGates } = await import("@/lib/gateMatching");

      setOccupancy(matchAircraftToGates(aircraft, layout.gates));
    } catch (e) {
      console.error("Occupancy load failed", e);
    }
  }

  loadOccupancy();
  const t = setInterval(loadOccupancy, 15000);
  return () => clearInterval(t);
}, [currentBase, airport]);


  // On mount, pull base from localStorage
  useEffect(() => {
    const initial = getInitialBaseCode();
    setCurrentBase(initial);
  }, []);

  // Whenever currentBase changes, persist to localStorage & fetch layout
  useEffect(() => {
    if (!currentBase) return;

    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, currentBase);
      }
    } catch {
      // ignore
    }

    const controller = new AbortController();

    async function fetchLayout() {
      setLoadingAirport(true);
      setAirportError(null);
      setAirport(null);

      try {
        const res = await fetch(
          `/api/airport-layout/${encodeURIComponent(currentBase)}`,
          { signal: controller.signal }
        );

        if (!res.ok) { 
          const body = await res.json().catch(() => null);
          const msg =
            body?.error || `Failed to load layout for ${currentBase}`;
          setAirportError(msg);
          setAirport(null);
          return;
        }

        const data = await res.json();
        setAirport(data.airport as AirportLayout);
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error("Error fetching airport layout:", err);
        setAirportError(`Error loading airport layout for ${currentBase}`);
      } finally {
        setLoadingAirport(false);
      }
    }

    fetchLayout();

    return () => controller.abort();
  }, [currentBase]);

  const handleBaseSelectChange = (code: string) => {
    setCurrentBase(code.toUpperCase());
  };

  const selectedBaseMeta = PSA_BASES.find(
    (b) => b.code.toUpperCase() === currentBase.toUpperCase()
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Debug stamp so we know this version is loaded */}
      <pre className="mb-2 px-4 pt-2 text-[10px] text-pink-600">
        DEBUG: dashboard v3 (webpack dev)
      </pre>

      {/* Top nav / header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-blue-700 text-xs font-bold tracking-tight text-white shadow-md">
              PSA
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Internal Prototype
              </div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">
                PSA Track – Surface Ops
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="hidden sm:inline">
              v0.1 · Public ADS-B + OSM · Not for operational use
            </span>
            <Link
              href="/"
              className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Overview
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {/* Base + status row */}
        <section className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)]">
          {/* Current base + selector */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Current base
                </p>
                <p className="text-lg font-semibold text-slate-900">
                  {selectedBaseMeta ? (
                    <>
                      {selectedBaseMeta.code}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        {selectedBaseMeta.icao} · {selectedBaseMeta.label}
                      </span>
                    </>
                  ) : (
                    <span>{currentBase}</span>
                  )}
                </p>
              </div>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                Prototype · Read-only
              </span>
            </div>

            <div className="mt-2 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="base-select"
                  className="text-xs font-medium text-slate-600"
                >
                  Quick switch PSA base
                </label>
                <select
                  id="base-select"
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  value={currentBase}
                  onChange={(e) => handleBaseSelectChange(e.target.value)}
                >
                  {PSA_BASES.map((base) => (
                    <option key={base.code} value={base.code}>
                      {base.code} – {base.label}
                      {base.hub ? " (Hub)" : ""}
                    </option>
                  ))}
                  <option value={currentBase}>
                    Other: {currentBase} (typed)
                  </option>
                </select>
              </div>
              <p className="text-[11px] leading-snug text-slate-500">
                On first launch of the full app, you&apos;ll type your home base{" "}
                <span className="font-mono text-[10px]">SAV / CLT / DAY / …</span>{" "}
                once. We&apos;ll treat that as your permanent base and use this
                panel for{" "}
                <span className="font-semibold">temporary base changes</span>{" "}
                only. A settings page will handle permanent changes.
              </p>
            </div>
          </div>

          {/* Build status / roadmap */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Build status
            </p>
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              <li>● Next.js app scaffolded & deployed</li>
              <li>● Base selection with per-device persistence</li>
              <li>● Supabase connected for airport layouts</li>
              <li>○ Leaflet surface map bound to base layout</li>
              <li>○ Gate turnover, pushback & taxi congestion analytics</li>
              <li>○ Arrival-to-gate ETA engine</li>
            </ul>
          </div>
        </section>

        {/* Airport data + map + side panels */}
        <section className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)]">
          {/* Left: airport + map */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Airport surface overview
                </p>
                <p className="text-sm font-semibold text-slate-900">
                  {airport?.name || "Loading airport…"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {airport
                    ? `${airport.icao_code || ""} · ${airport.iata_code || ""}`
                    : `Base: ${currentBase}`}
                </p>
              </div>
              <span className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-mono text-emerald-700">
                LIVE · layout from Supabase
              </span>
            </div>

            {/* Status / error line */}
            <div className="mb-3 text-[11px] text-slate-500">
              {loadingAirport && <p>Loading airport layout from Supabase…</p>}
              {!loadingAirport && airportError && (
                <p className="text-red-600">{airportError}</p>
              )}
              {!loadingAirport && !airportError && airport && (
                <p>
                  Center:{" "}
                  {airport.layout?.center
                    ? `${airport.layout.center.lat.toFixed(
                        4
                      )}, ${airport.layout.center.lon.toFixed(4)}`
                    : "not set"}{" "}
                  · Runways: {airport.layout?.runways?.length ?? 0} · Gates:{" "}
                  {airport.layout?.gates?.length ?? 0} · Taxi nodes:{" "}
                  {airport.layout?.taxiGraph?.length ?? 0}
                </p>
              )}
              {!loadingAirport && !airportError && !airport && (
                <p>No airport data loaded yet.</p>
              )}
            </div>

            {/* Leaflet map */}
            <div className="mt-2">
              <SurfaceMap
                airportCode={currentBase}
                airportName={airport?.name || "Current airport"}
              />
            </div>

            <p className="mt-2 text-[10px] text-slate-500">
              Data: public ADS-B & OpenStreetMap. For visualization/analytics
              only – not certified for ATC or operational dispatch.
            </p>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Gate occupancy */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Gate occupancy (live)
              </p>

              <table className="w-full text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-1 text-left font-medium">Gate</th>
                    <th className="py-1 text-left font-medium">Aircraft</th>
                    <th className="py-1 text-left font-medium">Type</th>
                    <th className="py-1 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {occupancy.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-2 text-center text-slate-400">
                        No gate activity detected
                      </td>
                    </tr>
                  )}

                  {occupancy.map((o) => (
                    <tr key={o.gateId} className="border-t border-slate-100">
                      <td className="py-1 font-mono">{o.gateId}</td>
                      <td className="py-1">{o.aircraft?.callsign ?? "—"}</td>
                      <td className="py-1">{o.aircraft ? "CRJ" : "—"}</td>
                      <td
                        className={`py-1 font-medium ${
                          o.aircraft ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {o.aircraft ? "Occupied" : "Free"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="mt-2 text-[10px] text-slate-400">
                Gate occupancy inferred from public ADS-B position + low ground speed
              </p>
            </div>

            {/* Compliance */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-700 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Compliance & usage
              </p>
              <p className="mt-2 leading-snug">
                Data sources: publicly accessible ADS-B and OpenStreetMap. This tool is for
                visualization, analytics and education only. It is not certified for ATC,
                operational dispatch or safety-critical decision making within PSA or American Airlines.
              </p>
              <p className="mt-2 text-[11px] text-slate-500">
                All timings (gate turns, ETAs, taxi delays) will be heuristic and based on public traffic
                snapshots, not internal schedules or company systems.
              </p>
            </div>

            {/* Upcoming */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-700 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Upcoming panels
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Gate turnover time by tail & gate (1h / 24h / 7d)</li>
                <li>Arrival-to-gate ETA engine from runway exit</li>
                <li>Taxi congestion hotspots & bottleneck alerts</li>
                <li>
                  Pushback alerts:{" "}
                  <span className="font-mono text-[10px]">
                    PUSHBACK — TAIL from GATE at LOCAL TIME
                  </span>
                </li>
              </ul>
            </div>
          </div>

        </section>
      </div>
    </main>
  );
}
