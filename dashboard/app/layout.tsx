import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks, Workflow, Cloud, ScrollText, Settings as SettingsIcon } from "lucide-react";
import { SleepIndicator } from "./_components/sleep-indicator";
import { MoonGlyph } from "./_components/moon-glyph";

export const metadata: Metadata = {
  title: "Sleepwalker — overnight agent fleet",
  description: "The Mac that runs while you sleep",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex relative z-10">
          <Sidebar />
          <main className="flex-1 px-12 py-10 max-w-6xl">{children}</main>
        </div>
      </body>
    </html>
  );
}

function Sidebar() {
  return (
    <aside className="w-64 border-r border-ink-600/60 px-6 py-8 flex flex-col gap-6 sticky top-0 h-screen">
      <Link href="/" className="flex items-baseline gap-2.5 group">
        <MoonGlyph />
        <span className="display-bold text-xl text-moon-50 leading-none">Sleepwalker</span>
      </Link>

      <SleepIndicator />

      <nav className="flex flex-col gap-0.5 mt-2">
        <NavLink href="/" icon={<ListChecks className="w-3.5 h-3.5" />}>Morning Queue</NavLink>
        <NavLink href="/routines" icon={<Workflow className="w-3.5 h-3.5" />}>Local Routines</NavLink>
        <NavLink href="/cloud" icon={<Cloud className="w-3.5 h-3.5" />}>Cloud Routines</NavLink>
        <NavLink href="/audit" icon={<ScrollText className="w-3.5 h-3.5" />}>Audit Log</NavLink>
        <NavLink href="/settings" icon={<SettingsIcon className="w-3.5 h-3.5" />}>Settings</NavLink>
      </nav>

      <div className="mt-auto space-y-3">
        <FleetCounter />
        <div className="hairline" />
        <div className="text-[10px] data text-moon-600 leading-relaxed">
          <div className="flex items-center justify-between">
            <span>v0.1 alpha</span>
            <span>·</span>
            <a className="hover:text-moon-400 transition-colors" href="https://github.com/rahulmehta25/sleepwalker" target="_blank" rel="noopener noreferrer">github →</a>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-moon-400 hover:text-moon-50 hover:bg-ink-700/60 transition-colors"
    >
      <span className="text-moon-600">{icon}</span>
      <span className="tracking-tight">{children}</span>
    </Link>
  );
}

function FleetCounter() {
  return (
    <div className="px-3 py-3 rounded-lg bg-ink-800/40 border border-ink-600/40">
      <div className="label mb-1.5">Fleet</div>
      <div className="flex items-baseline gap-2">
        <span className="display text-2xl text-moon-50 leading-none" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 360' }}>14</span>
        <span className="text-[11px] text-moon-400">routines</span>
      </div>
      <div className="text-[10px] text-moon-600 mt-1 data">
        <span className="text-signal-green">●</span> 6 local · <span className="text-aurora-400">●</span> 8 cloud
      </div>
    </div>
  );
}
