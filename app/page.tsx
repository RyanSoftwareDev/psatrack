// app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight mb-2">
          PSA Track – Surface Ops
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          Internal prototype dashboard. Not for operational use.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
