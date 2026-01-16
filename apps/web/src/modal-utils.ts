/**
 * Modal utility functions for common modal behavior.
 */

/**
 * Show a modal by removing the "hidden" class.
 */
export function showModal(modal: HTMLElement | null): void {
  modal?.classList.remove("hidden");
}

/**
 * Hide a modal by adding the "hidden" class.
 */
export function hideModal(modal: HTMLElement | null): void {
  modal?.classList.add("hidden");
}

/**
 * Set up standard close behavior for a modal:
 * - Close button click
 * - Click outside modal content (on backdrop)
 * - Optionally close on Escape key
 */
export function setupModalClose(
  modal: HTMLElement | null,
  closeBtn: HTMLElement | null,
  options: { closeOnEscape?: boolean } = {}
): void {
  if (!modal) return;

  // Close button click
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      hideModal(modal);
    });
  }

  // Click on backdrop (outside modal content)
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      hideModal(modal);
    }
  });

  // Close on Escape key
  if (options.closeOnEscape) {
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.classList.contains("hidden")) {
        hideModal(modal);
      }
    });
  }
}

/**
 * Set up a simple modal with an open button.
 */
export function setupSimpleModal(
  openBtn: HTMLElement | null,
  modal: HTMLElement | null,
  closeBtn: HTMLElement | null,
  options: { closeOnEscape?: boolean } = {}
): void {
  if (!modal) return;

  // Open button click
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      showModal(modal);
    });
  }

  setupModalClose(modal, closeBtn, options);
}

/**
 * Set up a delegated click handler for showing a modal.
 * Calls the provided show function when an element with the specified class is clicked.
 */
export function setupDelegatedModalTrigger<T>(
  className: string,
  dataAttribute: string,
  parseValue: (value: string) => T | null,
  showFn: (value: T) => void
): void {
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains(className)) {
      const attrValue = target.dataset[dataAttribute];
      if (attrValue !== undefined) {
        const parsed = parseValue(attrValue);
        if (parsed !== null) {
          showFn(parsed);
        }
      }
    }
  });
}
