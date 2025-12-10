"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function HomePage() {
  const router = useRouter();

  const [homeBaseCode, setHomeBaseCode] = useState<string>(DEFAULT_HOME_BASE);
  const [currentBaseCode, setCurrentBaseCode] =
    useState<string>(DEFAULT_HOME_BASE);
  const [hasLoadedPreference, setHasLoadedPreference] = useState(false);

  const [tempSwitcherOpen, setTempSwitcherOpen] = useState(false);
  const [tempBaseInput, setTempBaseInput] = useState("");

  // Load persisted base preferences on first client render
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
      // ignore localStorage errors (Safari private mode, etc.)
    } finally {
      setHasLoadedPreference(true);
    }
  }, []);

  const handleOpenDashboard = () => {
    router.push("/dashboard");
  };

  const selectedCurrent = SUPPORTED_AIRPORTS.find(
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
      {/* Top nav */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-psa-blue text-white text-sm font-semibold">
              PT
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">
                PSA Track
              </span>
              <span className="text-xs text-slate-500">
                Internal surface ops prototype
              </span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-600">
            <button
              className="hover:text-psa-blue"
              onClick={() => router.push("/")}
            >
              Overview
            </button>
            <button
              className="hover:text-psa-blue"
              onClick={handleOpenDashboard}
            >
              Surface map
            </button>
            <button className="hover:text-psa-blue">Analytics</button>
            <button className="hover:text-psa-blue">Settings</button>
          </nav>
        </div>
      </header>

      {/* Hero section */}
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          {/* Left: heading & CTAs */}
          <section className="space-y-5">
            <p className="inline-flex items-center rounded-full bg-psa-blue/5 px-3 py-1 text-xs font-medium text-psa-blue border border-psa-blue/10">
              PSA Airlines · internal tooling concept
            </p>

            <div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-slate-900">
                Track PSA aircraft at your base in real time.
              </h1>
              <p className="mt-3 text-sm md:text-base text-slate-600 max-w-xl">
                Visualize arrivals, departures, gate occupancy, and taxi
                congestion for PSA Airlines aircraft using public ADS-B data
                and airport layouts. Built for bases like SAV, CLT, DAY and
                more.
              </p>
            </div>

            {/* Home vs current base summary */}
            <div className="flex flex-col gap-1 text-xs text-slate-600">
              <div>
                <span className="font-semibold text-slate-800">
                  Home base:
                </span>{" "}
                <span className="font-mono">{homeBaseCode}</span>{" "}
                <span className="text-slate-500">
                  (set during signup · change in Settings)
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-800">
                  Currently viewing:
                </span>{" "}
                <span className="font-mono">{currentBaseCode}</span>{" "}
                {currentBaseCode !== homeBaseCode && (
                  <span className="text-amber-600">
                    temporary override — will reset to home base when you clear
                    storage or on new device.
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleOpenDashboard}
                className="inline-flex items-center rounded-md bg-psa-blue px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-psa-navy transition-colors"
              >
                Open dashboard
              </button>
              <button className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                View feature roadmap
              </button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 max-w-md">
              <span className="font-medium text-slate-700">Compliance:</span>{" "}
              Uses publicly accessible ADS-B &amp; OpenStreetMap data. For
              visualization/analytics only and not certified for ATC or
              operational dispatch.
            </div>
          </section>

          {/* Right: base card + feature grid */}
          <section className="rounded-2xl bg-white border border-slate-200 p-5 md:p-6 shadow-sm">
            {/* Base info & temp switch entry */}
            <div className="mb-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Current PSA base
                  </h2>
                  <p className="text-xs text-slate-500">
                    You&apos;re viewing surface traffic for{" "}
                    <span className="font-mono">{currentBaseCode}</span>. Your
                    saved home base is{" "}
                    <span className="font-mono">{homeBaseCode}</span>.
                  </p>
                </div>
              </div>

              {/* Temporary base switcher */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-xs text-slate-600">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    Temporarily change base
                  </span>
                  <button
                    type="button"
                    onClick={() => setTempSwitcherOpen((v) => !v)}
                    className="text-[11px] font-medium text-psa-blue hover:underline"
                  >
                    {tempSwitcherOpen ? "Hide" : "Open"}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Use this to quickly look at a different PSA base. To change
                  your permanent home base, go to Settings.
                </p>

                {tempSwitcherOpen && (
                  <div className="mt-3 space-y-2">
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
                      Any valid 3-letter base code is accepted. We&apos;ll
                      still attempt to resolve layout data even if it&apos;s
                      not one of the pre-listed PSA bases.
                    </div>

                    {/* Quick suggestions (dropdown-style helper) */}
                    <div className="flex flex-wrap gap-1">
                      {SUPPORTED_AIRPORTS.map((a) => (
                        <button
                          key={a.code}
                          type="button"
                          onClick={() => handleQuickSelect(a.code)}
                          className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-mono text-slate-700 hover:bg-slate-100"
                        >
                          {a.code}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 2x2 feature grid (unchanged except using currentBaseCode) */}
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-xl bg-psa-blue/5 p-3 border border-psa-blue/10">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-psa-blue text-white text-lg">
                  🗺️
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Surface map
                  </div>
                  <p className="text-xs text-slate-500">
                    Live airport map of{" "}
                    {selectedCurrent?.name ?? currentBaseCode} with PSA
                    aircraft positions.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 border border-slate-200">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-psa-red/10 text-psa-red text-lg">
                  ⛩️
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Gate analytics
                  </div>
                  <p className="text-xs text-slate-500">
                    Gate occupancy, turnaround timing, and pushback detection.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 border border-slate-200">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 text-lg">
                  🚦
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Taxi congestion
                  </div>
                  <p className="text-xs text-slate-500">
                    Taxi node heatmap to spot bottlenecks before they escalate.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 border border-slate-200">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-lg">
                  ⏱️
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Arrival ETAs
                  </div>
                  <p className="text-xs text-slate-500">
                    Estimated time from runway exit to gate per arriving PSA
                    aircraft.
                  </p>
                </div>
              </div>
            </div>

            <p className="mt-4 text-[11px] text-slate-500">
              Leaflet map, Supabase-backed layouts, and ADS-B polling will plug
              into this UI as we build out the engine.
            </p>
          </section>
        </div>

        <footer className="mt-10 border-t border-slate-200 pt-4 text-[11px] text-slate-500">
          PSA Track — concept tooling for PSA Airlines bases like SAV, CLT, DAY,
          and more. Built as a personal project using Next.js and public data
          sources.
        </footer>
      </div>
    </main>
  );
}
