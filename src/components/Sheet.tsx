import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

interface SheetProps {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  small?: boolean;
  /** Shown in the header instead of the title, which then stays available to screen readers only. */
  context?: ReactNode;
}

/** A modal built on the native <dialog>, which gives focus trapping, Esc and a backdrop for free. */
export function Sheet({ title, onClose, children, footer, small, context }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      // The browser starts on the first button, Close, and rings it. Start on the sheet itself
      // instead: screen readers still hear its name, and Tab still reaches Close first.
      if (document.activeElement === close.current) dialog.focus();
    }
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={small ? "sheet sheet--small" : "sheet"}
      aria-label={title}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet__head">
        <h2 className={context ? "sr-only" : undefined}>{title}</h2>
        {context && <span className="sheet__context">{context}</span>}
        <button type="button" className="icon-btn" ref={close} onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="sheet__body">{children}</div>
      {footer && <div className="sheet__foot">{footer}</div>}
    </dialog>
  );
}

interface ConfirmProps {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm(): void;
  onClose(): void;
  /** False for a choice that loses nothing, such as taking over a task. */
  danger?: boolean;
}

export function Confirm({ title, body, confirmLabel, onConfirm, onClose, danger = true }: ConfirmProps) {
  return (
    <Sheet
      title={title}
      small
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? "btn btn--danger" : "btn"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{body}</p>
    </Sheet>
  );
}
