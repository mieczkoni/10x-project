import * as React from "react";

import { Portal } from "@/components/ui/portal";

interface DeleteDeckConfirmDialogProps {
  open: boolean;
  deckName: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function DeleteDeckConfirmDialog({ open, deckName, onConfirm, onOpenChange }: DeleteDeckConfirmDialogProps) {
  const confirmButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const lastActiveRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) {
      if (lastActiveRef.current) {
        lastActiveRef.current.focus();
      }
      return;
    }

    if (typeof document !== "undefined") {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        lastActiveRef.current = active;
      }
    }

    window.setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 0);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 px-4">
        <button
          type="button"
          className="absolute inset-0 z-0 cursor-pointer"
          onClick={() => onOpenChange(false)}
          aria-label="Close dialog"
          tabIndex={-1}
        />
        <div
          className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-deck-title"
          tabIndex={-1}
        >
          <h2 id="delete-deck-title" className="text-lg font-semibold text-slate-900">
            Delete deck
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            This will permanently delete <span className="font-medium">{deckName}</span> and its cards. This action cannot
            be undone.
          </p>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="h-10 rounded-md border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-10 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-500"
              onClick={onConfirm}
              ref={confirmButtonRef}
            >
              Delete deck
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
