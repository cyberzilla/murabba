/**
 * Internationalization (i18n) Engine for Murabba
 * Supports Arabic (ar), English (en), and Indonesian (id)
 */

import { ar } from './locales/ar';
import { en } from './locales/en';
import { id } from './locales/id';
import type { SupportedLang } from '../types';

export type { SupportedLang };

export const STORAGE_LANG_KEY = 'kufi_lang';

export const LANGS: Record<SupportedLang, Record<string, string>> = {
  ar,
  en,
  id,
};

let currentLang: SupportedLang = 'en';

/**
 * Translates a key with optional string/number interpolation.
 * Supports `%s` and `%d` format placeholders.
 * Fallback chain: Current Lang -> English -> Arabic -> Key.
 *
 * @param key - Translation dictionary key
 * @param args - Positional arguments to replace %s / %d placeholders
 * @returns Translated and interpolated string
 */
export function t(key: string, ...args: (string | number)[]): string {
  const langDict = LANGS[currentLang];
  let str: string | undefined =
    langDict?.[key] ??
    LANGS.en?.[key] ??
    LANGS.ar?.[key] ??
    key;

  if (typeof str !== 'string') {
    str = String(str);
  }

  if (args.length > 0) {
    let argIndex = 0;
    str = str.replace(/%[sd]/g, (match) => {
      if (argIndex < args.length) {
        const val = args[argIndex++];
        return val !== undefined && val !== null ? String(val) : '';
      }
      return match;
    });
  }

  return str;
}

/**
 * Returns the currently active language code.
 *
 * @returns 'ar' | 'en' | 'id'
 */
export function getLang(): SupportedLang {
  return currentLang;
}

/**
 * Scans the DOM and updates all elements with internationalization data attributes:
 * - `data-i18n`: Updates textContent or input value
 * - `data-i18n-tip`: Updates `data-tip` and `title` attributes
 * - `data-i18n-placeholder`: Updates `placeholder` attribute
 * Also updates HTML dir ('rtl' or 'ltr'), lang attribute, and active language buttons.
 */
export function updateDOM(): void {
  if (typeof document === 'undefined') return;

  const isRTL = currentLang === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';

  if (document.documentElement) {
    document.documentElement.lang = currentLang;
    document.documentElement.dir = dir;
  }

  // Update bottom sheet direction if present
  const bottomSheet = document.getElementById('bottomSheet');
  if (bottomSheet) {
    bottomSheet.setAttribute('dir', dir);
  }

  // Highlight active language switcher button
  const langButtons = document.querySelectorAll<HTMLElement>('[data-lang-btn]');
  langButtons.forEach((btn) => {
    if (btn.getAttribute('data-lang-btn') === currentLang) {
      btn.style.outline = '2px solid var(--accent, #22C55E)';
      btn.style.fontWeight = '700';
    } else {
      btn.style.outline = '';
      btn.style.fontWeight = '';
    }
  });

  // Highlight active welcome screen language button
  const wlLangButtons = document.querySelectorAll<HTMLElement>('[data-wl-lang]');
  wlLangButtons.forEach((btn) => {
    if (btn.getAttribute('data-wl-lang') === currentLang) {
      btn.classList.add('accent');
    } else {
      btn.classList.remove('accent');
    }
  });

  // Update topbar language button label
  const tbLangSpan = document.getElementById('tbLangLabel');
  if (tbLangSpan) {
    const labels: Record<SupportedLang, string> = { ar: 'عربي', en: 'EN', id: 'ID' };
    tbLangSpan.textContent = labels[currentLang] || currentLang.toUpperCase();
  }

  // Update elements with data-i18n
  const i18nElements = document.querySelectorAll<HTMLElement>('[data-i18n]');
  i18nElements.forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const text = t(key);
    if (el instanceof HTMLInputElement && (el.type === 'button' || el.type === 'submit')) {
      el.value = text;
    } else {
      el.textContent = text;
    }
  });

  // Update tooltips via data-i18n-tip
  const tipElements = document.querySelectorAll<HTMLElement>('[data-i18n-tip]');
  tipElements.forEach((el) => {
    const key = el.getAttribute('data-i18n-tip');
    if (!key) return;
    const text = t(key);
    el.setAttribute('data-tip', text);
    if (el.hasAttribute('title')) {
      el.setAttribute('title', text);
    }
  });

  // Update input placeholders with data-i18n-placeholder
  const placeholderElements = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    '[data-i18n-placeholder]'
  );
  placeholderElements.forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) return;
    el.setAttribute('placeholder', t(key));
  });

  // Dispatch custom event for subscribers
  try {
    window.dispatchEvent(
      new CustomEvent('kufi:langchange', { detail: { lang: currentLang } })
    );
  } catch {
    // Environment may not support window CustomEvent
  }
}

/**
 * Sets the active language, updates document attributes, persists to localStorage,
 * and updates all translated DOM elements.
 *
 * @param lang - Target language code ('ar', 'en', 'id')
 */
export function setLang(lang: SupportedLang): void {
  if (lang !== 'ar' && lang !== 'en' && lang !== 'id') {
    currentLang = 'ar';
  } else {
    currentLang = lang;
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_LANG_KEY, currentLang);
    } catch {
      // Ignore localStorage quota or private-browsing errors
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', updateDOM, { once: true });
    } else {
      updateDOM();
    }
  }
}

/**
 * Initializes i18n from localStorage or browser preferences, defaulting to English.
 *
 * @returns Initialized active language
 */
export function initI18n(): SupportedLang {
  let savedLang: SupportedLang = 'en';

  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_LANG_KEY);
      if (stored === 'ar' || stored === 'en' || stored === 'id') {
        savedLang = stored;
      }
    } catch {
      savedLang = 'en';
    }
  }

  setLang(savedLang);
  return currentLang;
}

// Auto-initialize if running in the browser
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initI18n(), { once: true });
  } else {
    initI18n();
  }
}
