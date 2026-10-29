"use client";

export default function TorarButton({ onTorar }: { onTorar: () => void }) {
  return (
    <button
      type="button"
      className="torar-button"
      onClick={onTorar}
      aria-keyshortcuts="Space Enter"
      aria-describedby="torar-hint"
    >
      <span className="torar-shine" aria-hidden="true" />
      <span className="torar-label">TORAR!</span>
    </button>
  );
}
