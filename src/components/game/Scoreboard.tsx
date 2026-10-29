"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import SoundToggle from "./SoundToggle";
import { formatCounter } from "@/lib/format";
import type { ConnectionStatus } from "@/hooks/useSharedCounter";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  loading: "CONECTANDO AO PLACAR GLOBAL",
  live: "PLACAR GLOBAL · AO VIVO",
  syncing: "PLACAR GLOBAL · SINCRONIZANDO",
  offline: "PLACAR GLOBAL · SEM CONEXÃO",
  unconfigured: "PLACAR GLOBAL INDISPONÍVEL",
};

type ScoreboardProps = {
  value: string | null;
  status: ConnectionStatus;
  pending: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
};

export default function Scoreboard({
  value,
  status,
  pending,
  soundEnabled,
  onToggleSound,
}: ScoreboardProps) {
  const numberRef = useRef<HTMLSpanElement>(null);
  const previousValue = useRef<string | null>(null);
  const display = value ? formatCounter(value) : null;
  const fitScale = 1 / ((display?.length ?? 7) * 1.05);

  useEffect(() => {
    if (!value) return;
    const previous = previousValue.current;
    previousValue.current = value;
    if (previous === null || previous === value) return;

    const element = numberRef.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    element.getAnimations().forEach((animation) => animation.cancel());
    element.animate(
      [
        { transform: "translateY(0) scale(1)", filter: "brightness(1)" },
        { transform: "translateY(-5px) scale(1.12)", filter: "brightness(1.25)" },
        { transform: "translateY(0) scale(1)", filter: "brightness(1)" },
      ],
      { duration: 260, easing: "steps(4, end)" },
    );
  }, [value]);

  return (
    <section
      className="scoreboard"
      aria-label="Placar global Rennam Torado"
      data-status={status}
    >
      <div className="scoreboard-top">
        <span className="scoreboard-title">
          <img
            className="scoreboard-coin"
            src="/sprites/coin.png"
            alt=""
            width={10}
            height={14}
            draggable={false}
          />
          RENNAM TORADO:
        </span>
        <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} />
      </div>

      <div className="scoreboard-value-wrap">
        <span
          ref={numberRef}
          className={`scoreboard-value ${value === null ? "is-loading" : ""}`}
          style={{ "--fit-scale": fitScale } as CSSProperties}
          aria-hidden="true"
        >
          {display ?? "------"}
        </span>
      </div>

      <div className="scoreboard-status">
        <span className={`status-dot status-${status}`} aria-hidden="true" />
        <span>{value === null && status === "loading" ? STATUS_LABEL.loading : STATUS_LABEL[status]}</span>
        {pending > 0 && (
          <span className="pending-chip" aria-label={`${pending} cliques aguardando confirmação`}>
            {pending} NA FILA
          </span>
        )}
      </div>

      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {value ? `Rennam Torado: ${formatCounter(value)}` : "Carregando placar global"}
      </span>
    </section>
  );
}
