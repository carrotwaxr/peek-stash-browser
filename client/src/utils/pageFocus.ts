/**
 * Whether page code may move focus to `target` on its own (the Scene page's
 * initial focus, the player taking focus for a new scene) once a load lands.
 * `start` is what had focus when the page load or scene change began.
 *
 * It may unless the user moved focus since: focus on nothing, on an element
 * holding `target` (the player around its play button) or still on `start`
 * (the control that started the change: a similar-scene card, a TV remote's
 * selection) moves. Focus the user put anywhere else while the load ran
 * stays there, so a load that finishes late never takes it back and sends
 * their next key to the player.
 */
export function mayTakeFocus(target: Element, start: Element | null): boolean {
  const active = document.activeElement;
  return (
    active === null ||
    active === document.body ||
    active === start ||
    active.contains(target)
  );
}
