"use client";

export default function SoundToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`sound-toggle ${enabled ? "is-on" : "is-off"}`}
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Desligar efeitos sonoros" : "Ligar efeitos sonoros"}
      title={enabled ? "Efeitos sonoros ligados" : "Efeitos sonoros desligados"}
    >
      <svg
        className="sound-icon"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        aria-hidden="true"
        shapeRendering="crispEdges"
        focusable="false"
      >
        <path
          fill="currentColor"
          d="M1 5h3l3-3v12l-3-3H1V5zm9-2h2v2h2v6h-2v2h-2V3z"
        />
        {enabled ? (
          <path fill="currentColor" d="M13 1h2v2h-2V1zm0 12h2v2h-2v-2z" />
        ) : (
          <path fill="#ff5b4d" d="M10 6h2v2h2v2h-2v2h-2v-2h2V8h-2V6z" />
        )}
      </svg>
      <span className="sound-label">{enabled ? "SOM" : "MUDO"}</span>
    </button>
  );
}
