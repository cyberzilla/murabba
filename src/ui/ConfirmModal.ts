/**
 * ConfirmModal — Confirm and alert dialogs that replace native browser dialogs.
 * Supports confirm (OK/Cancel) and alert (OK only) modes with optional icons.
 */

import { t } from '../i18n/I18n';

type ModalType = 'confirm' | 'warning' | 'error' | 'success' | 'info';

let resolvePromise: ((value: boolean) => void) | null = null;

const ICONS: Record<ModalType, string> = {
  confirm: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="32" height="32"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="32" height="32"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="32" height="32"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="32" height="32"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="32" height="32"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r=".5" fill="currentColor"/></svg>`,
};

const ICON_COLORS: Record<ModalType, string> = {
  confirm: '#60A5FA', // blue
  warning: '#FBBF24', // amber
  error: '#F87171',   // red
  success: '#34D399', // green
  info: '#60A5FA',    // blue
};

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

function showModal(message: string, type: ModalType, isAlert: boolean): void {
  const modal = document.getElementById('confirmModal');
  const msg = document.getElementById('modalMsg');
  const icon = document.getElementById('modalIcon');
  const cancelBtn = document.getElementById('modalCancel');
  const okBtn = document.getElementById('modalOk');

  if (msg) msg.textContent = message;

  // Set icon
  if (icon) {
    icon.innerHTML = ICONS[type] || '';
    icon.style.color = ICON_COLORS[type] || '';
    icon.style.display = 'flex';
  }

  // Alert mode: hide cancel button, change OK text
  if (cancelBtn) cancelBtn.style.display = isAlert ? 'none' : '';

  // Update button text
  if (okBtn) okBtn.textContent = t('modal.ok');
  if (cancelBtn && !isAlert) cancelBtn.textContent = t('modal.cancel');

  // Set modal type for CSS styling
  if (modal) {
    modal.setAttribute('data-type', type);
    modal.classList.add('visible');
  }

  okBtn?.focus();
}

/**
 * Shows a confirmation dialog (OK/Cancel) and returns a promise.
 */
export function confirmDialog(message: string, type: ModalType = 'confirm'): Promise<boolean> {
  return new Promise((resolve) => {
    if (resolvePromise) resolvePromise(false);
    resolvePromise = resolve;
    showModal(message, type, false);
  });
}

/**
 * Shows an alert dialog (OK only) — replaces native alert().
 * Returns a promise that resolves when dismissed.
 */
export function alertDialog(message: string, type: ModalType = 'info'): Promise<void> {
  return new Promise((resolve) => {
    if (resolvePromise) resolvePromise(false);
    resolvePromise = () => resolve();
    showModal(message, type, true);
  });
}
