import { useEffect, useRef } from 'react';
import {
  CONFETTI_DRIFT,
  CONFETTI_DURATION_MS,
  CONFETTI_GRAVITY,
  createParticles,
  paintsPeach,
} from './confetti.ts';
import type { CostumeId } from '../costumes.ts';
import { drawPeach } from '../peachArt.ts';

/**
 * A one-shot confetti burst on a single canvas overlay, for the cute Edition
 * Complete moment. Animates only transform-like canvas ops and opacity, runs a
 * requestAnimationFrame loop that stops at the duration, and signals onDone so
 * the parent unmounts it. The overlay never intercepts taps. Reduced-motion and
 * theme gating live at the call site; this component just plays the burst.
 */
export function Confetti({
  onDone,
  costume = null,
}: {
  onDone: () => void;
  /** On a costume day, the peaches in the burst wear it. */
  costume?: CostumeId | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas?.getContext('2d') ?? null;
    } catch {
      ctx = null;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas && ctx) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.scale(dpr, dpr);
    }

    const particles = createParticles(width, height);
    let raf = 0;
    let startTs = 0;
    let running = true;

    const draw = (elapsed: number) => {
      if (!ctx) return;
      const t = elapsed / 1000;
      ctx.clearRect(0, 0, width, height);
      // Hold full, then fade over the final third so the burst tears down softly.
      const fadeFrom = CONFETTI_DURATION_MS * 0.66;
      const alpha =
        elapsed <= fadeFrom
          ? 1
          : Math.max(
              0,
              1 - (elapsed - fadeFrom) / (CONFETTI_DURATION_MS - fadeFrom),
            );
      for (const p of particles) {
        const x =
          p.x + p.vx * t + Math.sin(t * 3 + p.rotation) * CONFETTI_DRIFT;
        const y = p.y + p.vy * t + 0.5 * CONFETTI_GRAVITY * t * t;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.rotate(p.rotation + p.spin * t);
        ctx.font = `${p.size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (paintsPeach(p.motif, costume)) {
          drawPeach(ctx, 0, 0, p.size, { costume, face: false });
        } else {
          if (p.motif.color) ctx.fillStyle = p.motif.color;
          ctx.fillText(p.motif.glyph, 0, 0);
        }
        ctx.restore();
      }
    };

    const frame = (ts: number) => {
      if (!running) return;
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs;
      draw(elapsed);
      if (elapsed < CONFETTI_DURATION_MS) raf = requestAnimationFrame(frame);
    };
    if (typeof requestAnimationFrame === 'function') {
      raf = requestAnimationFrame(frame);
    }

    // Teardown is timer-driven so it is deterministic regardless of rAF: when the
    // burst is over, tell the parent, which unmounts us and runs the cleanup.
    const done = window.setTimeout(onDone, CONFETTI_DURATION_MS);

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [onDone, costume]);

  return (
    <canvas
      ref={canvasRef}
      className="confetti"
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    />
  );
}
