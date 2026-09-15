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

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="mx-auto flex max-w-5xl items-center gap-5 px-4 py-3 text-sm font-medium">
            <span className="text-base font-bold">LoyRoy Admin</span>
            <Link className="hover:underline" href="/members">Members</Link>
            <Link className="hover:underline" href="/issue">Issue pass</Link>
            <Link className="hover:underline" href="/scanner">Scanner</Link>
            <Link className="hover:underline" href="/assets">Assets</Link>
          </nav>
        </header>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
