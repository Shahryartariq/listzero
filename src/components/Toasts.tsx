import { useEffect } from "react";
import { useStore } from "../state/store-context";
import { Icon } from "./Icon";

export function Toasts() {
  const { toasts, dismissToast, undoToast } = useStore();

  useEffect(() => {
    if (toasts.length === 0) return;
    const soonest = Math.min(...toasts.map((t) => t.expiresAt));
    const timer = window.setTimeout(
      () => {
        const now = Date.now();
        toasts.filter((t) => t.expiresAt <= now).forEach((t) => dismissToast(t.id));
      },
      Math.max(0, soonest - Date.now()) + 20,
    );
    return () => window.clearTimeout(timer);
  }, [toasts, dismissToast]);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className="toast" key={toast.id}>
          <span>{toast.message}</span>
          <span className="toast__actions">
            {(toast.undo || toast.onUndo) && (
              <button type="button" className="toast__undo" onClick={() => undoToast(toast.id)}>
                Undo
              </button>
            )}
            <button type="button" className="icon-btn" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
              <Icon name="close" size={18} />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
