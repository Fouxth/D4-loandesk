/**
 * Automatically dismiss virtual keyboard on mobile devices when tapping
 * empty space, outside active inputs, or when scrolling the UI.
 */
export function setupMobileKeyboardDismiss() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // Dismiss keyboard when tapping on empty area / outside active input
  const handlePointerDown = (e: PointerEvent | TouchEvent) => {
    const activeEl = document.activeElement;
    if (!activeEl || !(activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement)) {
      return;
    }

    const target = e.target as HTMLElement | null;
    if (!target) return;

    // If user tapped the active input itself or inside it, keep focus
    if (target === activeEl || activeEl.contains(target)) {
      return;
    }

    // If user tapped another input, textarea, select, or editable element, let browser handle focus transfer
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.closest("input, textarea, select, [contenteditable='true']")
    ) {
      return;
    }

    // User tapped empty area, label, card, background, modal header/footer, button, etc. -> dismiss keyboard
    activeEl.blur();
  };

  // Dismiss keyboard when dragging / scrolling
  let isScrolling = false;
  const handleTouchMove = () => {
    if (isScrolling) return;
    const activeEl = document.activeElement;
    if (activeEl && (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement)) {
      isScrolling = true;
      activeEl.blur();
      setTimeout(() => {
        isScrolling = false;
      }, 100);
    }
  };

  window.addEventListener("pointerdown", handlePointerDown, { capture: true, passive: true });
  window.addEventListener("touchmove", handleTouchMove, { capture: true, passive: true });
}
