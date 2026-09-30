import { type ReactNode, useState } from "react";
import { ShortcutDispatcher, ShortcutScopeContext } from "./shortcutDispatcher";

export type {
  ShortcutHandler,
  ShortcutLayer,
  ShortcutScopeOptions,
} from "./shortcutDispatcher";

/** Provides the app's keyboard dispatcher; mounted inside `TVModeProvider`. */
export function ShortcutScopeProvider({ children }: { children: ReactNode }) {
  const [dispatcher] = useState(() => new ShortcutDispatcher());
  return (
    <ShortcutScopeContext.Provider value={dispatcher}>
      {children}
    </ShortcutScopeContext.Provider>
  );
}
