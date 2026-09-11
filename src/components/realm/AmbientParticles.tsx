import { useEffect, useRef } from "react";
import { useTheme } from "@/theme/ThemeProvider";
import type { ParticleRecipe } from "@/theme/themes";
import { cn } from "@/lib/utils";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  ttl: number;
  color: string;
  phase: number;
}

/**
 * Ambient motion behind the Throne Room, drawn on one canvas. Iron Crown breathes embers upward,
 * Gilded Realm lets gold dust drift, Neon Kingdom rains data streaks. Skipped entirely under
 * prefers-reduced-motion and paused while the tab is hidden; capped at the recipe's count.
 */
export function AmbientParticles({ className }: { className?: string }) {
  const { theme, reducedMotion } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recipe = theme.particles;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reducedMotion) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const parent = canvas.parentElement ?? canvas;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const particles: Particle[] = [];
    const spawn = (fresh: boolean): Particle => makeParticle(recipe, width, height, fresh);
    for (let i = 0; i < recipe.count; i++) particles.push(spawn(false));

    let last = performance.now();
    let frame = 0;
    let running = true;

    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        p.life += dt;
        p.phase += dt;
        if (p.life > p.ttl || p.y < -20 || p.y > height + 20 || p.x < -20 || p.x > width + 20) {
          particles[i] = spawn(true);
          continue;
        }
        p.x += p.vx * dt + (recipe.kind === "motes" ? Math.sin(p.phase * 1.3) * 6 * dt : 0);
        p.y += p.vy * dt;
        drawParticle(ctx, recipe.kind, p);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frame);
      } else if (!running) {
        running = true;
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [recipe, reducedMotion]);

  if (reducedMotion) return null;
  return <canvas ref={canvasRef} className={cn("pointer-events-none absolute inset-0 h-full w-full", className)} aria-hidden data-testid="ambient-particles" data-kind={recipe.kind} />;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function makeParticle(recipe: ParticleRecipe, width: number, height: number, fresh: boolean): Particle {
  const color = recipe.colors[Math.floor(Math.random() * recipe.colors.length)] ?? recipe.colors[0] ?? "40 80% 60%";
  switch (recipe.kind) {
    case "embers":
      return {
        x: rand(0, width),
        y: fresh ? height + rand(0, 20) : rand(0, height),
        vx: rand(-6, 6),
        vy: -rand(recipe.speed * 0.6, recipe.speed * 1.6),
        size: rand(1, 2.6),
        life: 0,
        ttl: rand(6, 14),
        color,
        phase: rand(0, Math.PI * 2),
      };
    case "motes":
      return {
        x: rand(0, width),
        y: fresh ? -rand(0, 20) : rand(0, height),
        vx: rand(-4, 4),
        vy: rand(recipe.speed * 0.4, recipe.speed * 1.2),
        size: rand(1, 2.2),
        life: 0,
        ttl: rand(10, 24),
        color,
        phase: rand(0, Math.PI * 2),
      };
    case "streaks":
    default:
      return {
        x: rand(0, width),
        y: fresh ? -rand(10, 60) : rand(0, height),
        vx: 0,
        vy: rand(recipe.speed * 0.5, recipe.speed * 1.5),
        size: rand(0.8, 1.6),
        life: 0,
        ttl: rand(3, 8),
        color,
        phase: rand(0, Math.PI * 2),
      };
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, kind: ParticleRecipe["kind"], p: Particle) {
  const fade = Math.min(1, p.life / 0.8) * Math.max(0, 1 - (p.life - (p.ttl - 1.2)) / 1.2);
  if (kind === "streaks") {
    const len = p.vy * 0.12;
    const grad = ctx.createLinearGradient(p.x, p.y - len, p.x, p.y);
    grad.addColorStop(0, `hsl(${p.color} / 0)`);
    grad.addColorStop(1, `hsl(${p.color} / ${0.75 * fade})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = p.size;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - len);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    return;
  }
  const flicker = kind === "embers" ? 0.6 + 0.4 * Math.sin(p.phase * 7) : 0.75 + 0.25 * Math.sin(p.phase * 2);
  const alpha = (kind === "embers" ? 0.85 : 0.6) * fade * flicker;
  ctx.fillStyle = `hsl(${p.color} / ${alpha})`;
  ctx.shadowColor = `hsl(${p.color} / ${alpha * 0.8})`;
  ctx.shadowBlur = kind === "embers" ? 8 : 4;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}
