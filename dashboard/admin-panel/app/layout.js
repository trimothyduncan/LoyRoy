import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import AuthGate from "@/components/AuthGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "LoyRoy Admin",
  description: "Loyalty & membership admin dashboard",
};

const NAV = [
  { href: "/members", label: "Members" },
  { href: "/issue", label: "Issue pass" },
  { href: "/scanner", label: "Scanner" },
  { href: "/assets", label: "Assets" },
  { href: "/analytics", label: "Analytics" },
];

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* Mobile top bar */}
        <header className="border-b border-white/10 md:hidden">
          <nav className="flex items-center gap-4 overflow-x-auto px-4 py-3 text-sm font-medium">
            <span className="text-base font-bold text-white">LoyRoy</span>
            {NAV.map((n) => (
              <Link key={n.href} className="whitespace-nowrap text-slate-200" href={n.href}>
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <div className="flex">
          {/* Sidebar */}
          <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 p-4 md:flex">
            <div className="v-card p-4">
              <p className="text-base font-bold text-white">LoyRoy Admin</p>
              <p className="v-muted mt-0.5 text-xs">Merchant loyalty console</p>
            </div>
            <nav className="v-card mt-3 flex flex-col gap-1 p-3">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </aside>
          {/* Content */}
          <div className="min-w-0 flex-1">
            <AuthGate>{children}</AuthGate>
          </div>
        </div>
      </body>
    </html>
  );
}
