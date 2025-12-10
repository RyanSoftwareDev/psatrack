"use client";

import { useEffect, useState } from "react";
import type React from "react";

type AirportOption = {
  code: string;
  name: string;
};

const DEFAULT_HOME_BASE = "SAV";

const SUPPORTED_AIRPORTS: AirportOption[] = [
  { code: "SAV", name: "Savannah / Hilton Head (KSAV)" },
  { code: "CLT", name: "Charlotte Douglas (KCLT)" },
  { code: "DAY", name: "Dayton (KDAY)" },
  { code: "DFW", name: "Dallas–Fort Worth (KDFW)" },
  { code: "PNS", name: "Pensacola (KPNS)" },
];

const HOME_BASE_KEY = "psatrack.homeBaseCode";
const CURRENT_BASE_KEY = "psatrack.currentBaseCode";

export default function DashboardPage() {
  const [homeBaseCode, setHomeBaseCode] = useState<string>(DEFAULT_HOME_BASE);
  const [currentBaseCode, setCurrentBaseCode] =
    useState<string>(DEFAULT_HOME_BASE);
  const [hasLoadedPreference, setHasLoadedPreference] = useState(false);

  const [tempSwitcherOpen, setTempSwitcherOpen] = useState(false);
  const [tempBaseInput, setTempBaseInput] = useState("");

  useEffect(() => {
    try {
      const storedHome = window.localStorage.getItem(HOME_BASE_KEY);
      const storedCurrent = window.localStorage.getItem(CURRENT_BASE_KEY);

      const effectiveHome = (storedHome || DEFAULT_HOME_BASE).toUpperCase();
      const effectiveCurrent = (
        storedCurrent ||
        storedHome ||
        DEFAULT_HOME_BASE
      ).toUpperCase();

      setHomeBaseCode(effectiveHome);
      setCurrentBaseCode(effectiveCurrent);
    } catch {
      // ignore
    } finally {
      setHasLoadedPreference(true);
    }
  }, []);

  const selectedAirport = SUPPORTED_AIRPORTS.find(
    (a) => a.code === currentBaseCode
  );

  const handleTempBaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = tempBaseInput.trim().toUpperCase();

    if (code.length !== 3) {
      alert("Please enter a 3-letter base code (e.g. SAV, CLT).");
      return;
    }

    setCurrentBaseCode(code);
    try {
      window.localStorage.setItem(CURRENT_BASE_KEY, code);
    } catch {
      // ignore
    }
    setTempBaseInput("");
    setTempSwitcherOpen(false);
  };

  const handleQuickSelect = (code: string) => {
    const upper = code.toUpperCase();
    setCurrentBaseCode(upper);
    try {
      window.localStorage.setItem(CURRENT_BASE_KEY, upper);
    } catch {
      // ignore
    }
  };

  return (
    <main className="min-h-screen bg-psa-bg text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-psa-blue text-white text-sm font-semibold">
              PT
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">
                PSA Track · Surface dashboard
              </span>
              <span className="text-xs text-slate-500">
                Live surface view for PSA aircraft at{" "}
                <span className="font-mono">{currentBaseCode}</span>.
              </span>
            </div>
          </div>

          <div className="hidden md:flex flex-col items-end text-[11px] text-slate-500">
            <div>
              <span className="font-semibold text-slate-800">
                Home base:
              </span>{" "}
              <span className="font-mono">{homeBaseCode}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-800">
                Current base:
              </span>{" "}
              <span className="font-mono">{currentBaseCode}</span>{" "}
              {currentBaseCode !== homeBaseCode && (
                <span className="text-amber-600">(temporary override)</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-4 md:py-6">
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          {/* Left: map shell */}
          <section className="rounded-2xl bg-slate-950 text-slate-50 shadow-sm border border-slate-900/40 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div>
                <h2 className="text-sm font-semibold">
                  Surface map — {selectedAirport?.name ?? currentBaseCode}
                </h2>
                <p className="text-[11px] text-slate-400">
                  Gates, runways, taxiways and live surface traffic (public
                  ADS-B).
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                LIVE • 5s polling
              </span>
            </div>

            <div className="flex-1 flex items-center justify-center px-4 py-6">
              <div className="w-full h-[420px] md:h-[520px] rounded-xl border border-dashed border-slate-700 bg-slate-900/60 flex items-center justify-center text-[12px] text-slate-400 text-center px-6">
                Leaflet map will render here for{" "}
                {selectedAirport?.name ?? currentBaseCode} — including runway
                occupancy, gate status, taxi congestion heatmap, and
                arrival-to-gate ETAs.
              </div>
            </div>

            <div className="px-4 pb-3 pt-2 border-t border-slate-800 text-[11px] text-slate-500">
              Data sources: public ADS-B &amp; OpenStreetMap. For
              visualization/analytics only — not certified for ATC or
              operational dispatch.
            </div>
          </section>

          {/* Right: analytics + temporary switcher */}
          <aside className="space-y-3">
            {/* Temporary base switch panel */}
            <div className="rounded-xl bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Temporary base switch
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    View another PSA base without changing your saved home base.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTempSwitcherOpen((v) => !v)}
                  className="text-[11px] font-medium text-psa-blue hover:underline"
                >
                  {tempSwitcherOpen ? "Hide" : "Open"}
                </button>
              </div>

              {tempSwitcherOpen && (
                <div className="px-4 py-3 space-y-3 text-[12px] text-slate-600">
                  <form
                    onSubmit={handleTempBaseSubmit}
                    className="flex gap-2 items-center"
                  >
                    <input
                      type="text"
                      inputMode="text"
                      maxLength={3}
                      placeholder="e.g. SAV, CLT, DAY"
                      value={tempBaseInput}
                      onChange={(e) =>
                        setTempBaseInput(e.target.value.toUpperCase())
                      }
                      className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-psa-blue"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-psa-blue px-3 py-1.5 text-[11px] font-medium text-white hover:bg-psa-navy"
                    >
                      Apply
                    </button>
                  </form>

                  <div className="text-[10px] text-slate-500">
                    Any valid 3-letter base code is accepted. Layout and
                    analytics will be loaded for that base where supported.
                    Permanent home base changes live in Settings.
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {SUPPORTED_AIRPORTS.map((a) => (
                      <button
                        key={a.code}
                        type="button"
                        onClick={() => handleQuickSelect(a.code)}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-mono text-slate-700 hover:bg-slate-100"
                      >
                        {a.code}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!tempSwitcherOpen && (
                <div className="px-4 py-3 text-[11px] text-slate-500">
                  Home base:{" "}
                  <span className="font-mono">{homeBaseCode}</span>. Currently
                  viewing:{" "}
                  <span className="font-mono">{currentBaseCode}</span>. To
                  change your permanent home base, use the Settings screen
                  (coming soon).
                </div>
              )}
            </div>

            {/* Gate turnover panel */}
            <div className="rounded-xl bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Gate turnover time
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Average time at gate by PSA tail (prototype).
                  </p>
                </div>
                <select className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
                  <option>Last 24 hours</option>
                  <option>Last 1 hour</option>
                  <option>Last 7 days</option>
                </select>
              </div>
              <div className="px-4 py-3 text-[12px] text-slate-500">
                No data yet. Once the engine is wired to ADS-B, this panel will
                show per-gate average turn times and cycle counts.
              </div>
            </div>

            {/* Arrival ETA panel */}
            <div className="rounded-xl bg-white border border-slate-200 shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">
                  Arrival-to-gate ETAs
                </h3>
                <p className="text-[11px] text-slate-500">
                  Heuristic ETA from runway exit to assigned gate, per arriving
                  PSA flight.
                </p>
              </div>
              <div className="px-4 py-3 text-[12px] text-slate-500">
                No arriving aircraft detected yet. When live data is connected,
                this will list active arrivals with runway, gate, and ETA.
              </div>
            </div>

            {/* Taxi bottlenecks panel */}
            <div className="rounded-xl bg-white border border-slate-200 shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">
                  Taxi bottlenecks
                </h3>
                <p className="text-[11px] text-slate-500">
                  Hotspots on the taxi graph where multiple PSA aircraft stack
                  up.
                </p>
              </div>
              <div className="px-4 py-3 text-[12px] text-slate-500">
                No bottlenecks flagged. Once sampling is enabled, this will
                surface high-density taxi nodes with severity and tail list.
              </div>
              <div className="px-4 pb-3 text-[10px] text-slate-400">
                Heuristic analytics based on public ADS-B and airport layouts.
                Not for tactical control.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
