/**
 * AboutModal — Developer info & keyboard shortcuts modal.
 * Displays app branding, developer credits, links, and
 * a complete keyboard shortcut reference table.
 */

import { t } from '../i18n/I18n';

let modal: HTMLElement | null = null;

/** Initialize and wire the about modal. Call once on startup. */
export function initAboutModal(): void {
  if (!document.getElementById('aboutModal')) {
    createModalDOM();
  }
  modal = document.getElementById('aboutModal');

  // Close on overlay click
  modal?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'aboutModal') hideAbout();
  });

  // Close on × button
  document.getElementById('aboutClose')?.addEventListener('click', hideAbout);

  // Close on Escape
  modal?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideAbout();
  });
}

export function showAbout(): void {
  if (modal) {
    modal.classList.add('open');
    // Update dynamic i18n if needed
    updateTexts();
  }
}

export function hideAbout(): void {
  if (modal) modal.classList.remove('open');
}

function updateTexts(): void {
  // Update translatable elements
  const els = modal?.querySelectorAll('[data-i18n]');
  els?.forEach(el => {
    const key = el.getAttribute('data-i18n')!;
    const translated = t(key);
    if (translated !== key) el.textContent = translated;
  });
}

function createModalDOM(): void {
  const overlay = document.createElement('div');
  overlay.id = 'aboutModal';
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  overlay.innerHTML = `
    <div class="modal-box about-panel">
      <!-- ═══ HEADER ═══ -->
      <div class="about-header">
        <div class="about-brand">
          <div class="about-logo">✦</div>
          <div>
            <div class="about-title">Murabba <span class="about-arabic">مُرَبَّع</span></div>
            <div class="about-subtitle" data-i18n="about.appDesc">Square Kufic Calligraphy Editor</div>
          </div>
        </div>
        <button class="le-close-btn" id="aboutClose" title="Close">✕</button>
      </div>

      <!-- ═══ APP INFO ═══ -->
      <div class="about-section">
        <p class="about-desc" data-i18n="about.appIntroText">
          A free, open-source tool for designing Square Kufic calligraphy.
          Runs entirely in the browser — no server needed, no data collected.
        </p>
        <div class="about-links">
          <a href="https://github.com/cyberzilla/murabba" target="_blank" rel="noopener" class="about-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
            <span data-i18n="about.sourceCode">Source Code</span>
          </a>
          <span class="about-link-sep">·</span>
          <span class="about-badge">v2.1.0</span>
          <span class="about-link-sep">·</span>
          <span class="about-badge">MIT</span>
        </div>
      </div>

      <!-- ═══ KEYBOARD SHORTCUTS ═══ -->
      <div class="about-section">
        <h4 class="about-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/></svg>
          Keyboard Shortcuts
        </h4>
        <div class="shortcut-grid">
          <div class="shortcut-group">
            <div class="shortcut-group-title">Tools</div>
            <div class="shortcut-row"><kbd>V</kbd><span>Cursor</span></div>
            <div class="shortcut-row"><kbd>B</kbd><span>Draw</span></div>
            <div class="shortcut-row"><kbd>E</kbd><span>Eraser</span></div>
            <div class="shortcut-row"><kbd>F</kbd><span>Fill</span></div>
            <div class="shortcut-row"><kbd>W</kbd><span>Brush</span></div>
            <div class="shortcut-row"><kbd>H</kbd><span>Pan</span></div>
            <div class="shortcut-row"><kbd>S</kbd><span>Select</span></div>
          </div>
          <div class="shortcut-group">
            <div class="shortcut-group-title">Actions</div>
            <div class="shortcut-row"><kbd>Ctrl+Z</kbd><span>Undo</span></div>
            <div class="shortcut-row"><kbd>Ctrl+Y</kbd><span>Redo</span></div>
            <div class="shortcut-row"><kbd>Ctrl+C</kbd><span>Copy</span></div>
            <div class="shortcut-row"><kbd>Ctrl+X</kbd><span>Cut</span></div>
            <div class="shortcut-row"><kbd>Ctrl+V</kbd><span>Paste</span></div>
            <div class="shortcut-row"><kbd>Ctrl+S</kbd><span>Export PNG</span></div>
            <div class="shortcut-row"><kbd>Delete</kbd><span>Erase selection</span></div>
          </div>
          <div class="shortcut-group">
            <div class="shortcut-group-title">Transform</div>
            <div class="shortcut-row"><kbd>R</kbd><span>Rotate CW</span></div>
            <div class="shortcut-row"><kbd>Shift+R</kbd><span>Rotate CCW</span></div>
            <div class="shortcut-row"><kbd>X</kbd><span>Flip horizontal</span></div>
            <div class="shortcut-row"><kbd>Y</kbd><span>Flip vertical</span></div>
          </div>
          <div class="shortcut-group">
            <div class="shortcut-group-title">Navigation</div>
            <div class="shortcut-row"><kbd>Ctrl+Scroll</kbd><span>Zoom in/out</span></div>
            <div class="shortcut-row"><kbd>Arrow keys</kbd><span>Nudge selection</span></div>
            <div class="shortcut-row"><kbd>Enter</kbd><span>Confirm selection</span></div>
            <div class="shortcut-row"><kbd>Esc</kbd><span>Cancel / Close</span></div>
          </div>
        </div>
      </div>

      <!-- ═══ DEVELOPER ═══ -->
      <div class="about-footer">
        <span>Made with ♥ by <a href="https://github.com/cyberzilla" target="_blank" rel="noopener">cyberzilla</a></span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}
