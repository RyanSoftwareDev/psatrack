import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PSA Track",
  description:
    "Internal PSA Airlines aircraft surface tracking prototype using public ADS-B data.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Keep className="no-touch" so the client-side scripts and SSR match
    <html lang="en" className="no-touch">
      {/* Light PSA background + default text */}
      <body className="bg-psa-bg text-slate-900">
        {children}
      </body>
    </html>
  );
}
