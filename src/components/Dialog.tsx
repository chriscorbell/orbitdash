import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";

interface DialogProps {
  title: string;
  /** Called once the dialog has finished closing. */
  onClose: () => void;
  wide?: boolean;
  /** Gets a `close` that plays the exit animation, then calls onClose. */
  children: (close: () => void) => ReactNode;
}

/** A modal on the native <dialog>: focus trapping, Escape and the backdrop come from the browser. */
export function Dialog({ title, onClose, wide = false, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const close = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) onClose();
    else setClosing(true);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      data-wide={wide || undefined}
      data-closing={closing || undefined}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onMouseDown={(event) => {
        // The dialog element itself only receives clicks on its backdrop.
        if (event.target === event.currentTarget) close();
      }}
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-body">
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        {children(close)}
      </div>
    </dialog>
  );
}
