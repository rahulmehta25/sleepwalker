"use client";

import { useEffect, useState } from "react";

interface Phase {
  label: string;
  isAsleep: boolean;
  hour: number;
  minute: number;
}

function readPhase(startHour = 23, endHour = 7): Phase {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const inSleep = startHour > endHour
    ? h >= startHour || h < endHour
    : h >= startHour && h < endHour;
  return {
    label: inSleep ? "Sleep window" : "Awake — interactive mode",
    isAsleep: inSleep,
    hour: h,
    minute: m,
  };
}

export function SleepIndicator() {
  const [phase, setPhase] = useState<Phase>(() => readPhase());

  useEffect(() => {
    const id = setInterval(() => setPhase(readPhase()), 30_000);
    return () => clearInterval(id);
  }, []);

  const time = `${String(phase.hour).padStart(2, "0")}:${String(phase.minute).padStart(2, "0")}`;

  return (
    <div className="px-3 py-3 rounded-lg bg-ink-800/40 border border-ink-600/40">
      <div className="flex items-center justify-between">
        <div className="label">Now</div>
        <div className={`relative w-1.5 h-1.5 rounded-full ${phase.isAsleep ? "bg-aurora-400" : "bg-dawn-400"}`}>
          <span className={`absolute inset-0 rounded-full animate-ping opacity-60 ${phase.isAsleep ? "bg-aurora-400" : "bg-dawn-400"}`} />
        </div>
      </div>
      <div className="display text-3xl text-moon-50 leading-none mt-1.5 tabular-nums" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 320' }}>
        {time}
      </div>
      <div className="text-[10px] text-moon-400 mt-1 leading-tight">
        {phase.label}
      </div>
    </div>
  );
}
