"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

type Particle = {
  kind: "pixel" | "coin";
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  phase: number;
};

export type ParticleHandle = {
  impact: (x: number, y: number, options?: { reduced?: boolean }) => void;
  confetti: (options?: { reduced?: boolean; mega?: boolean }) => void;
  coinRain: (count: number, options?: { reduced?: boolean }) => void;
  clear: () => void;
};

const CONFETTI_COLORS = ["#ffd93b", "#e8402f", "#2f66d9", "#57c33a", "#ffffff", "#ff8ec7", "#ffb347"];

const ParticleLayer = forwardRef<ParticleHandle>(function ParticleLayer(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const startLoopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const coinImage = new Image();
    coinImage.src = "/sprites/coin.png";
    const coinRef = { current: coinImage };

    let disposed = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      context.imageSmoothingEnabled = false;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const frame = (now: number) => {
      const { width, height, dpr } = sizeRef.current;
      const elapsed = lastTimeRef.current === 0 ? 16.6667 : now - lastTimeRef.current;
      const delta = Math.min(2.5, Math.max(0.2, elapsed / 16.6667));
      lastTimeRef.current = now;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const list = particlesRef.current;
      for (let index = list.length - 1; index >= 0; index -= 1) {
        const particle = list[index];
        particle.vy += particle.gravity * delta;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.life -= delta;
        particle.phase += 0.22 * delta;

        if (
          particle.life <= 0 ||
          particle.y > height + 80 ||
          particle.x < -90 ||
          particle.x > width + 90
        ) {
          list.splice(index, 1);
          continue;
        }

        const alpha = Math.min(1, particle.life / 24);
        context.globalAlpha = alpha;

        if (particle.kind === "coin" && coinRef.current.complete) {
          const squash = 0.35 + 0.65 * Math.abs(Math.sin(particle.phase));
          const coinWidth = particle.size;
          const coinHeight = particle.size * 1.4;
          context.save();
          context.translate(Math.round(particle.x), Math.round(particle.y));
          context.scale(squash, 1);
          context.drawImage(
            coinRef.current,
            -coinWidth / 2,
            -coinHeight / 2,
            coinWidth,
            coinHeight,
          );
          context.restore();
        } else {
          context.fillStyle = particle.color;
          context.fillRect(
            Math.round(particle.x),
            Math.round(particle.y),
            particle.size,
            particle.size,
          );
        }
      }

      context.globalAlpha = 1;

      if (list.length > 0 && !disposed) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        rafRef.current = null;
      }
    };

    startLoopRef.current = () => {
      if (disposed || rafRef.current !== null) return;
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(frame);
    };

    return () => {
      disposed = true;
      startLoopRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      observer.disconnect();
      particlesRef.current = [];
    };
  }, []);

  useImperativeHandle(
    ref,
    () => {
      const spawn = (items: Particle[]) => {
        const list = particlesRef.current;
        list.push(...items);
        if (list.length > 500) list.splice(0, list.length - 500);
        startLoopRef.current?.();
      };

      return {
        impact(x, y, options) {
          const reduced = options?.reduced ?? false;
          const items: Particle[] = [];
          const pixelCount = reduced ? 7 : 16;

          for (let index = 0; index < pixelCount; index += 1) {
            const angle = -Math.PI * (0.12 + Math.random() * 0.76);
            const speed = 2 + Math.random() * 4.6;
            const life = 34 + Math.random() * 24;
            items.push({
              kind: "pixel",
              x,
              y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              gravity: 0.22,
              life,
              maxLife: life,
              size: 3 + Math.round(Math.random() * 3),
              color: index % 3 === 0 ? "#fffdf0" : index % 3 === 1 ? "#ffd93b" : "#ffb347",
              phase: 0,
            });
          }

          if (!reduced) {
            for (let index = 0; index < 2; index += 1) {
              const life = 95 + Math.random() * 25;
              items.push({
                kind: "coin",
                x,
                y,
                vx: (index === 0 ? -1 : 1) * (1.4 + Math.random() * 1.4),
                vy: -5.4 - Math.random() * 1.4,
                gravity: 0.26,
                life,
                maxLife: life,
                size: 16,
                color: "#ffd93b",
                phase: Math.random() * 6,
              });
            }
          }

          spawn(items);
        },

        confetti(options) {
          const reduced = options?.reduced ?? false;
          const mega = options?.mega ?? false;
          const { width } = sizeRef.current;
          const count = reduced ? 16 : mega ? 170 : 90;
          const items: Particle[] = [];

          for (let index = 0; index < count; index += 1) {
            const life = 250 + Math.random() * 200;
            items.push({
              kind: "pixel",
              x: Math.random() * width,
              y: -30 - Math.random() * 220,
              vx: -1.1 + Math.random() * 2.2,
              vy: 1.2 + Math.random() * 2.8,
              gravity: 0.016,
              life,
              maxLife: life,
              size: 4 + Math.round(Math.random() * 5),
              color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
              phase: 0,
            });
          }

          spawn(items);
        },

        coinRain(count, options) {
          const reduced = options?.reduced ?? false;
          const { width } = sizeRef.current;
          const total = reduced ? Math.min(8, count) : count;
          const items: Particle[] = [];

          for (let index = 0; index < total; index += 1) {
            const life = 420 + Math.random() * 160;
            items.push({
              kind: "coin",
              x: 20 + Math.random() * Math.max(1, width - 40),
              y: -30 - Math.random() * 260,
              vx: -0.6 + Math.random() * 1.2,
              vy: 1.4 + Math.random() * 2.4,
              gravity: 0.026,
              life,
              maxLife: life,
              size: 14 + Math.round(Math.random() * 6),
              color: "#ffd93b",
              phase: Math.random() * 6,
            });
          }

          spawn(items);
        },

        clear() {
          particlesRef.current = [];
          const canvas = canvasRef.current;
          const context = canvas?.getContext("2d");
          if (canvas && context) {
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, canvas.width, canvas.height);
          }
        },
      };
    },
    [],
  );

  return <canvas ref={canvasRef} className="particle-layer" aria-hidden="true" />;
});

export default ParticleLayer;
