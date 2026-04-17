"use client";

import { motion } from "framer-motion";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  meta,
}: {
  eyebrow: string;
  title: string;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 0.65, 0.3, 0.95] }}
      className="mb-10"
    >
      <div className="label mb-3">{eyebrow}</div>
      <h1 className="display text-5xl text-moon-50 leading-[0.95] tracking-tightest mb-3" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 320' }}>
        {title}
      </h1>
      {subtitle && <p className="text-moon-400 text-base leading-relaxed max-w-2xl">{subtitle}</p>}
      {meta && <div className="mt-4 flex flex-wrap gap-2">{meta}</div>}
    </motion.header>
  );
}

export function StaggerList({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: 0.04, delayChildren: 0.15 } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.65, 0.3, 0.95] } },
      }}
    >
      {children}
    </motion.div>
  );
}
