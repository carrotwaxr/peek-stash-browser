import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ConfirmDialog from "../components/ui/ConfirmDialog";

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmText?: string;
  confirmStyle?: "danger" | "primary";
}

/**
 * Peek's replacement for the browser's `confirm()`: `await confirm({...})`
 * opens a `ConfirmDialog` and resolves `true` on Confirm, `false` on Cancel,
 * Escape, the backdrop or unmount. The caller renders `dialog` once. A second
 * `confirm` while one is open resolves the first `false`.
 *
 * The dialog opens on Cancel, a safe answer for a TV remote's OK button, and
 * its Escape closes only it, not a modal under it (the top overlay owns
 * Escape).
 */
export function useConfirmDialog(): {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((answer: boolean) => void) | null>(null);

  const settle = useCallback((answer: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setOptions(null);
    resolve?.(answer);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setOptions(opts);
      }),
    []
  );

  // A caller that unmounts mid-question gets "no", never a hanging promise
  useEffect(
    () => () => {
      resolveRef.current?.(false);
      resolveRef.current = null;
    },
    []
  );

  const dialog = (
    <ConfirmDialog
      isOpen={options !== null}
      onClose={() => settle(false)}
      onConfirm={() => settle(true)}
      title={options?.title}
      message={options?.message}
      confirmText={options?.confirmText}
      confirmStyle={options?.confirmStyle}
    />
  );

  return { confirm, dialog };
}
