import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Moon, ListChecks, Workflow, Cloud, ScrollText, Settings as SettingsIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Sleepwalker",
  description: "The Mac that runs while you sleep",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex">
          <nav className="w-56 border-r border-sw-border p-4 flex flex-col gap-1 sticky top-0 h-screen">
            <Link href="/" className="flex items-center gap-2 mb-6 px-2">
              <Moon className="w-5 h-5 text-sw-accent" />
              <span className="font-semibold">Sleepwalker</span>
            </Link>
            <NavLink href="/" icon={<ListChecks className="w-4 h-4" />}>Morning Queue</NavLink>
            <NavLink href="/routines" icon={<Workflow className="w-4 h-4" />}>Local Routines</NavLink>
            <NavLink href="/cloud" icon={<Cloud className="w-4 h-4" />}>Cloud Routines</NavLink>
            <NavLink href="/audit" icon={<ScrollText className="w-4 h-4" />}>Audit Log</NavLink>
            <NavLink href="/settings" icon={<SettingsIcon className="w-4 h-4" />}>Settings</NavLink>
            <div className="mt-auto text-xs text-sw-muted px-2 leading-relaxed">
              <div>v0.1 alpha</div>
              <a className="text-sw-muted hover:text-sw-text" href="https://github.com/rahulmehta25/sleepwalker" target="_blank" rel="noopener noreferrer">github →</a>
            </div>
          </nav>
          <main className="flex-1 p-8 max-w-5xl">{children}</main>
        </div>
      </body>
    </html>
  );
}

function NavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sw-muted hover:text-sw-text hover:bg-sw-border transition-colors">
      {icon}
      {children}
    </Link>
  );
}
