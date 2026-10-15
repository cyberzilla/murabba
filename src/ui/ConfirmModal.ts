/**
 * Custom confirm modal that replaces native browser confirm().
 */

let resolvePromise: ((value: boolean) => void) | null = null;

export function initConfirmModal(): void {
  const modal = document.getElementById('confirmModal');
  const okBtn = document.getElementById('modalOk');
  const cancelBtn = document.getElementById('modalCancel');

  okBtn?.addEventListener('click', () => {
    modal?.classList.remove('visible');
    resolvePromise?.(true);
    resolvePromise = null;
  });

  cancelBtn?.addEventListener('click', () => {
    modal?.classList.remove('visible');
    resolvePromise?.(false);
    resolvePromise = null;
  });

  // Close on backdrop click
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('visible');
      resolvePromise?.(false);
      resolvePromise = null;
    }
  });
}

export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    resolvePromise = resolve;
    const modal = document.getElementById('confirmModal');
    const msg = document.getElementById('modalMsg');
    if (msg) msg.textContent = message;
    modal?.classList.add('visible');
  });
}
