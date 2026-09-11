import { motion } from "framer-motion";
import { useMemo } from "react";

interface GrowthBurstProps {
  /** Re-trigger by changing this key. */
  trigger: string | number;
  particles?: number;
  className?: string;
}

/**
 * A short burst of gold sparks that radiates from the center when a number
 * grows. Pure CSS/Framer transforms — no canvas, a dozen DOM nodes.
 */
export function GrowthBurst({ trigger, particles = 14, className }: GrowthBurstProps) {
  const sparks = useMemo(
    () =>
      Array.from({ length: particles }, (_, i) => {
        const angle = (i / particles) * Math.PI * 2 + (i % 2) * 0.2;
        const dist = 70 + (i % 3) * 28;
        return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, delay: (i % 4) * 0.05, size: 3 + (i % 3) * 2 };
      }),
    [particles],
  );

  return (
    <div className={className} aria-hidden>
      {sparks.map((s, i) => (
        <motion.span
          key={`${trigger}-${i}`}
          className="absolute left-1/2 top-1/2 rounded-full bg-gold"
          style={{ width: s.size, height: s.size, boxShadow: "0 0 8px hsl(43 80% 60%)" }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
          animate={{ x: s.x, y: s.y, opacity: [0, 1, 0], scale: [0.4, 1.2, 0.6] }}
          transition={{ duration: 1.4, delay: s.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
