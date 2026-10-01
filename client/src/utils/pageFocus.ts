/**
 * Whether page code may move focus to `target` on its own (the Scene page's
 * initial focus, the player taking focus for a new scene): only while focus
 * is on nothing, or on an element holding `target` (the player around its
 * play button). Focus the user put anywhere else stays there, so a load that
 * finishes late never takes it back and sends their next key to the player.
 */
export function mayTakeFocus(target: Element): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || active.contains(target);
}
