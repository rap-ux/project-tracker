"use client";

import { useCallback, useState } from "react";
import { useModalA11y } from "./useModalA11y";

interface ConfirmOpts { title?: string; confirmLabel?: string; danger?: boolean }
interface State extends ConfirmOpts { open: boolean; message: string; resolve?: (v: boolean) => void }

// Split out so useModalA11y (a hook) only runs while the dialog is actually
// mounted, matching React's rules of hooks.
function ConfirmDialog({ state, close }: { state: State; close: (v: boolean) => void }) {
  const { ref: modalRef, dialogProps } = useModalA11y(() => close(false));
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/50"
      onClick={() => close(false)}>
      <div ref={modalRef} {...dialogProps} aria-labelledby="confirm-dialog-title"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl outline-none">
        <h2 id="confirm-dialog-title" className="font-medium text-text">{state.title ?? "Are you sure?"}</h2>
        <p className="text-sm text-muted mt-1.5">{state.message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => close(false)}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted hover:bg-surface-2 transition-colors">
            Cancel
          </button>
          <button onClick={() => close(true)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 ${
              state.danger ? "bg-danger" : "bg-accent"}`}>
            {state.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Promise-based styled replacement for window.confirm().
// Usage: const { confirm, dialog } = useConfirm();
//   if (!(await confirm("Delete this?", { danger: true }))) return;
//   ...and render {dialog} somewhere in the component.
export function useConfirm() {
  const [state, setState] = useState<State>({ open: false, message: "" });

  const confirm = useCallback((message: string, opts?: ConfirmOpts) => {
    return new Promise<boolean>(resolve => {
      setState({ open: true, message, resolve, ...opts });
    });
  }, []);

  const close = (val: boolean) => {
    state.resolve?.(val);
    setState(s => ({ ...s, open: false, resolve: undefined }));
  };

  const dialog = state.open ? <ConfirmDialog state={state} close={close} /> : null;

  return { confirm, dialog };
}
