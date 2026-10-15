/**
 * Custom confirm modal that replaces native browser confirm().
 */

let resolvePromise: ((value: boolean) => void) | null = null;

export function initConfirmModal(): void {
  const modal = document.getElementById('confirmModal');
  const okBtn = document.getElementById('modalOk');
  const cancelBtn = document.getElementById('modalCancel');

  const closeModal = (value: boolean) => {
    modal?.classList.remove('visible');
    if (resolvePromise) {
      resolvePromise(value);
      resolvePromise = null;
    }
  };

  okBtn?.addEventListener('click', () => closeModal(true));
  cancelBtn?.addEventListener('click', () => closeModal(false));

  // Close on backdrop click
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(false);
    }
  });

  // Close on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && resolvePromise && modal?.classList.contains('visible')) {
      e.preventDefault();
      closeModal(false);
    }
  });
}

export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Resolve any pending promise before creating new one
    if (resolvePromise) {
      resolvePromise(false);
    }
    resolvePromise = resolve;
    const modal = document.getElementById('confirmModal');
    const msg = document.getElementById('modalMsg');
    if (msg) msg.textContent = message;
    modal?.classList.add('visible');

    // Focus the OK button for keyboard accessibility
    const okBtn = document.getElementById('modalOk');
    okBtn?.focus();
  });
}
