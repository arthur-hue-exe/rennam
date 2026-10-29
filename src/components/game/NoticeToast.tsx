"use client";

export default function NoticeToast({
  message,
  canRetry,
  onRetry,
  retrying,
  onDismiss,
}: {
  message: string | null;
  canRetry: boolean;
  onRetry: () => void;
  retrying: boolean;
  onDismiss: () => void;
}) {
  if (!message) return null;

  return (
    <div className="notice-layer">
      <div className="notice" role="alert">
        <span className="notice-icon" aria-hidden="true">
          !
        </span>
        <p className="notice-text">{message}</p>
        <div className="notice-actions">
          {canRetry && (
            <button
              type="button"
              className="notice-retry"
              onClick={onRetry}
              disabled={retrying}
            >
              {retrying ? "TENTANDO..." : "TENTAR DE NOVO"}
            </button>
          )}
          <button
            type="button"
            className="notice-close"
            onClick={onDismiss}
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
