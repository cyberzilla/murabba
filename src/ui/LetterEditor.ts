/**
 * LetterEditor — Modal-based interactive letter editor.
 * Create, edit, and delete custom Kufic letter definitions.
 * Supports drawing/erasing cells + gap bridges via DOM grid.
 * Supports positional forms (isolated/initial/medial/final) and multiple variations.
 */

import type { LetterEntry, LetterForm, LetterPosition } from '../types/grid';
import { t } from '../i18n/I18n';

export interface LetterEditorCallbacks {
  /** Called when a letter is saved. ch is the letter key. */
  onSave(ch: string, entry: LetterEntry): void;
  /** Called when a letter is deleted. ch is the letter key. */
  onDelete(ch: string): void;
}

// ─── Form Tab Definitions ──────────────────────────────

type FormTab = 'isolated' | 'initial' | 'medial' | 'final' | 'variation';
const FORM_TABS: { key: FormTab; i18nKey: string }[] = [
  { key: 'isolated', i18nKey: 'letterEditor.tabSingle' },
  { key: 'initial', i18nKey: 'letterEditor.tabStart' },
  { key: 'medial', i18nKey: 'letterEditor.tabCenter' },
  { key: 'final', i18nKey: 'letterEditor.tabEnd' },
  { key: 'variation', i18nKey: 'letterEditor.tabVariation' },
];

// ─── Form Data Type ────────────────────────────────────

interface FormData {
  w: number;
  h: number;
  m: number[][];
  gH: number[][];
  gV: number[][];
  gD: number[][];
}

// ─── State ─────────────────────────────────────────────

let modal: HTMLElement | null = null;
let editorGrid: HTMLElement | null = null;

let gridW = 5;
let gridH = 5;
let cellMatrix: number[][] = [];
let gHMatrix: number[][] = [];
let gVMatrix: number[][] = [];
let gDMatrix: number[][] = [];

let editorTool: 'draw' | 'erase' = 'draw';
let isPointerDown = false;
let editingCh: string | null = null;
let callbacks: LetterEditorCallbacks | null = null;

// ─── Form Tabs State ───────────────────────────────────

let activeFormTab: FormTab = 'isolated';

/** Stores matrix data for positional forms (isolated/initial/medial/final) */
let formsData: Record<string, FormData | null> = {
  isolated: null, initial: null, medial: null, final: null,
};

/** Stores multiple variation form data */
let variationsData: FormData[] = [];
let activeVariationIdx = 0;

// ─── Public API ────────────────────────────────────────

/**
 * Initializes the letter editor modal. Creates DOM if not present.
 */
export function initLetterEditor(cb: LetterEditorCallbacks): void {
  callbacks = cb;
  if (!document.getElementById('letterEditorModal')) {
    createModalDOM();
  }
  modal = document.getElementById('letterEditorModal');
  wireEditorEvents();
}

/**
 * Opens editor with a blank new letter.
 */
export function openNewLetter(): void {
  editingCh = null;
  gridW = 5;
  gridH = 5;
  initMatrices();

  // Reset all forms data
  formsData = { isolated: null, initial: null, medial: null, final: null };
  variationsData = [];
  activeVariationIdx = 0;
  activeFormTab = 'isolated';

  const charInput = document.getElementById('leChar') as HTMLInputElement;
  const nameInput = document.getElementById('leName') as HTMLInputElement;
  const wInput = document.getElementById('leGridW') as HTMLInputElement;
  const hInput = document.getElementById('leGridH') as HTMLInputElement;
  if (charInput) { charInput.value = ''; charInput.disabled = false; }
  if (nameInput) nameInput.value = '';
  if (wInput) wInput.value = String(gridW);
  if (hInput) hInput.value = String(gridH);

  const delBtn = document.getElementById('leDeleteBtn');
  if (delBtn) delBtn.style.display = 'none';

  updateFormTabsUI();
  updateVarSubTabs();
  buildEditorGrid();
  showModal();
}

/**
 * Opens editor with an existing letter for editing.
 */
export function openEditLetter(ch: string, entry: LetterEntry): void {
  editingCh = ch;

  // Reset all forms data
  formsData = { isolated: null, initial: null, medial: null, final: null };
  variationsData = [];
  activeVariationIdx = 0;

  // Populate isolated form from root entry data
  const isoM = entry.m;
  const isoH = isoM.length;
  const isoW = isoM[0]?.length || 1;
  formsData.isolated = {
    w: isoW, h: isoH,
    m: isoM.map(r => [...r]),
    gH: (entry.gH || []).map(r => [...r]),
    gV: (entry.gV || []).map(r => [...r]),
    gD: (entry.gD || []).map(r => [...r]),
  };

  // Populate positional forms from entry.forms
  if (entry.forms) {
    const positions: Array<'initial' | 'medial' | 'final'> = ['initial', 'medial', 'final'];
    for (const pos of positions) {
      const form = entry.forms[pos];
      if (form) {
        const fH = form.m.length;
        const fW = form.m[0]?.length || 1;
        formsData[pos] = {
          w: fW, h: fH,
          m: form.m.map(r => [...r]),
          gH: (form.gH || []).map(r => [...r]),
          gV: (form.gV || []).map(r => [...r]),
          gD: (form.gD || []).map(r => [...r]),
        };
      }
    }
  }

  // Populate variations from entry.variations array
  if (entry.variations && entry.variations.length > 0) {
    for (const vf of entry.variations) {
      const vH = vf.m.length;
      const vW = vf.m[0]?.length || 1;
      variationsData.push({
        w: vW, h: vH,
        m: vf.m.map(r => [...r]),
        gH: (vf.gH || []).map(r => [...r]),
        gV: (vf.gV || []).map(r => [...r]),
        gD: (vf.gD || []).map(r => [...r]),
      });
    }
  }

  // Load isolated tab as active
  activeFormTab = 'isolated';
  loadTabData('isolated');

  const charInput = document.getElementById('leChar') as HTMLInputElement;
  const nameInput = document.getElementById('leName') as HTMLInputElement;
  const wInput = document.getElementById('leGridW') as HTMLInputElement;
  const hInput = document.getElementById('leGridH') as HTMLInputElement;
  if (charInput) { charInput.value = ch; charInput.disabled = true; }
  if (nameInput) nameInput.value = entry.name || '';
  if (wInput) wInput.value = String(gridW);
  if (hInput) hInput.value = String(gridH);

  const delBtn = document.getElementById('leDeleteBtn');
  if (delBtn) delBtn.style.display = '';

  updateFormTabsUI();
  updateVarSubTabs();
  buildEditorGrid();
  showModal();
}

// ─── DOM Creation ──────────────────────────────────────

function createModalDOM(): void {
  const overlay = document.createElement('div');
  overlay.id = 'letterEditorModal';
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  // Build form tabs HTML
  const tabsHTML = FORM_TABS.map(tab =>
    `<button class="le-form-tab${tab.key === 'isolated' ? ' active' : ''}" data-form="${tab.key}">${t(tab.i18nKey)}</button>`
  ).join('');

  overlay.innerHTML = `
    <div class="modal-box le-panel">
      <!-- ═══ HEADER: title + char/name fields + close ═══ -->
      <div class="le-header">
        <h3 id="leTitle">Letter Editor</h3>
        <button class="le-close-btn" id="leClose" title="Close">✕</button>
      </div>

      <div class="le-meta">
        <div class="le-field">
          <label for="leChar">Char</label>
          <input type="text" id="leChar" maxlength="4" placeholder="ب" />
        </div>
        <div class="le-field le-field-grow">
          <label for="leName">Name</label>
          <input type="text" id="leName" placeholder="Letter name" />
        </div>
      </div>

      <!-- ═══ FORM TABS: positional form selector ═══ -->
      <div class="le-form-tabs" id="leFormTabs">
        ${tabsHTML}
      </div>

      <!-- ═══ VARIATION SUB-TABS: shown only when Variation tab is active ═══ -->
      <div class="le-var-tabs" id="leVarTabs" style="display:none">
        <div class="le-var-list" id="leVarList"></div>
        <button class="le-var-add" id="leVarAdd" title="${t('letterEditor.addVariation')}">+</button>
        <button class="le-var-del" id="leVarDel" title="${t('letterEditor.deleteVariation')}">×</button>
      </div>

      <!-- ═══ CANVAS: the main drawing grid ═══ -->
      <div class="le-editor-wrap">
        <div id="leEditorGrid" class="le-editor-grid"></div>
      </div>

      <!-- ═══ TOOLBAR: grid size + tools + clear — one compact row ═══ -->
      <div class="le-toolbar">
        <div class="le-toolbar-group">
          <label>W</label>
          <input type="number" id="leGridW" min="1" max="20" value="5" />
          <span class="le-toolbar-sep">×</span>
          <label>H</label>
          <input type="number" id="leGridH" min="1" max="20" value="5" />
          <button class="s-btn sm" id="leResizeBtn" title="Apply grid size">↻</button>
        </div>
        <div class="le-toolbar-sep-v"></div>
        <div class="le-toolbar-group">
          <button class="le-tool-btn active" id="leToolDraw" title="Draw">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button class="le-tool-btn" id="leToolErase" title="Erase">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 20H7L3 16l9-9 8 8-4 4z"/><path d="m6.5 17.5 4-4"/></svg>
          </button>
        </div>
        <div class="le-toolbar-sep-v"></div>
        <button class="s-btn sm" id="leClearBtn" title="Clear all">Clear</button>
      </div>

      <!-- ═══ FOOTER: delete (left) | cancel + save (right) ═══ -->
      <div class="le-actions">
        <button class="s-btn sm danger" id="leDeleteBtn" style="display:none">Delete</button>
        <div class="le-spacer"></div>
        <button class="s-btn sm" id="leCancelBtn">Cancel</button>
        <button class="s-btn sm accent" id="leSaveBtn">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

// ─── Event Wiring ──────────────────────────────────────

function wireEditorEvents(): void {
  const close = document.getElementById('leClose');
  const cancel = document.getElementById('leCancelBtn');
  const save = document.getElementById('leSaveBtn');
  const del = document.getElementById('leDeleteBtn');
  const resize = document.getElementById('leResizeBtn');
  const clear = document.getElementById('leClearBtn');
  const toolDraw = document.getElementById('leToolDraw');
  const toolErase = document.getElementById('leToolErase');

  close?.addEventListener('click', hideModal);
  cancel?.addEventListener('click', hideModal);

  // ── Save: assemble all forms + variations into one LetterEntry ──
  save?.addEventListener('click', () => {
    const charInput = document.getElementById('leChar') as HTMLInputElement;
    const nameInput = document.getElementById('leName') as HTMLInputElement;
    const ch = charInput?.value.trim();
    if (!ch) { charInput?.focus(); return; }

    // Save current active tab data first
    saveCurrentTabData();

    // Build root entry from isolated form
    const iso = formsData.isolated;
    const rootM = iso ? iso.m.map(r => [...r]) : cellMatrix.map(r => [...r]);
    const rootGH = iso ? iso.gH.map(r => [...r]) : gHMatrix.map(r => [...r]);
    const rootGV = iso ? iso.gV.map(r => [...r]) : gVMatrix.map(r => [...r]);
    const rootGD = iso ? iso.gD.map(r => [...r]) : gDMatrix.map(r => [...r]);

    // Build forms object from positional form data (excluding isolated)
    const forms: Partial<Record<LetterPosition, LetterForm>> = {};
    const posTabs: Array<'initial' | 'medial' | 'final'> = ['initial', 'medial', 'final'];
    for (const tab of posTabs) {
      const fd = formsData[tab];
      if (fd && hasAnyFill(fd)) {
        forms[tab] = {
          m: fd.m.map(r => [...r]),
          gH: fd.gH.map(r => [...r]),
          gV: fd.gV.map(r => [...r]),
          gD: fd.gD.map(r => [...r]),
        };
      }
    }

    // Build variations array
    const variations: LetterForm[] = [];
    for (const vd of variationsData) {
      if (hasAnyFill(vd)) {
        variations.push({
          m: vd.m.map(r => [...r]),
          gH: vd.gH.map(r => [...r]),
          gV: vd.gV.map(r => [...r]),
          gD: vd.gD.map(r => [...r]),
        });
      }
    }

    const entry: LetterEntry = {
      ch,
      name: nameInput?.value.trim() || ch,
      m: rootM,
      gH: rootGH,
      gV: rootGV,
      gD: rootGD,
      forms: Object.keys(forms).length > 0 ? forms : undefined,
      variations: variations.length > 0 ? variations : undefined,
      _builtin: false,
    };

    callbacks?.onSave(ch, entry);
    hideModal();
  });

  del?.addEventListener('click', () => {
    if (!editingCh) return;
    callbacks?.onDelete(editingCh);
    hideModal();
  });

  resize?.addEventListener('click', () => {
    const wInput = document.getElementById('leGridW') as HTMLInputElement;
    const hInput = document.getElementById('leGridH') as HTMLInputElement;
    const newW = Math.max(1, Math.min(20, parseInt(wInput?.value) || 5));
    const newH = Math.max(1, Math.min(20, parseInt(hInput?.value) || 5));
    resizeMatrices(newW, newH);
    buildEditorGrid();
  });

  clear?.addEventListener('click', () => {
    initMatrices();
    buildEditorGrid();
  });

  toolDraw?.addEventListener('click', () => {
    editorTool = 'draw';
    toolDraw.classList.add('active');
    toolErase?.classList.remove('active');
  });

  toolErase?.addEventListener('click', () => {
    editorTool = 'erase';
    toolErase.classList.add('active');
    toolDraw?.classList.remove('active');
  });

  // ── Form tab switching ──
  const tabContainer = document.getElementById('leFormTabs');
  tabContainer?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.le-form-tab') as HTMLElement;
    if (!btn) return;
    const targetTab = btn.dataset.form as FormTab;
    if (!targetTab || targetTab === activeFormTab) return;
    switchFormTab(targetTab);
  });

  // ── Variation sub-tab events ──
  const varList = document.getElementById('leVarList');
  varList?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.le-var-tab') as HTMLElement;
    if (!btn) return;
    const idx = parseInt(btn.dataset.vidx || '0');
    if (idx === activeVariationIdx) return;
    switchVariation(idx);
  });

  document.getElementById('leVarAdd')?.addEventListener('click', addVariation);
  document.getElementById('leVarDel')?.addEventListener('click', deleteVariation);

  // Pointer up anywhere stops painting
  document.addEventListener('pointerup', () => { isPointerDown = false; });
}

// ─── Form Tab Logic ────────────────────────────────────

/** Saves current working matrices into the appropriate data store */
function saveCurrentTabData(): void {
  const data: FormData = {
    w: gridW,
    h: gridH,
    m: cellMatrix.map(r => [...r]),
    gH: gHMatrix.map(r => [...r]),
    gV: gVMatrix.map(r => [...r]),
    gD: gDMatrix.map(r => [...r]),
  };

  if (activeFormTab === 'variation') {
    // Save into variations array
    if (activeVariationIdx < variationsData.length) {
      variationsData[activeVariationIdx] = data;
    }
  } else {
    formsData[activeFormTab] = data;
  }
}

/** Loads matrix data for a given tab into the working matrices */
function loadTabData(tab: FormTab): void {
  let fd: FormData | null = null;

  if (tab === 'variation') {
    fd = variationsData[activeVariationIdx] || null;
  } else {
    fd = formsData[tab] || null;
  }

  if (fd) {
    gridW = fd.w;
    gridH = fd.h;
    cellMatrix = fd.m.map(r => [...r]);
    gHMatrix = fd.gH.map(r => [...r]);
    gVMatrix = fd.gV.map(r => [...r]);
    gDMatrix = fd.gD.map(r => [...r]);
  } else {
    // No data — start with empty 5×5
    gridW = 5;
    gridH = 5;
    initMatrices();
  }

  // Update grid size inputs
  const wInput = document.getElementById('leGridW') as HTMLInputElement;
  const hInput = document.getElementById('leGridH') as HTMLInputElement;
  if (wInput) wInput.value = String(gridW);
  if (hInput) hInput.value = String(gridH);
}

/** Switches from current tab to target tab */
function switchFormTab(tab: FormTab): void {
  saveCurrentTabData();
  activeFormTab = tab;

  // When switching to variation, ensure at least one slot exists
  if (tab === 'variation' && variationsData.length === 0) {
    variationsData.push(makeEmptyFormData());
    activeVariationIdx = 0;
  }

  loadTabData(tab);
  updateFormTabsUI();
  updateVarSubTabs();
  buildEditorGrid();
}

/** Updates form tab button active states and has-data indicators */
function updateFormTabsUI(): void {
  const tabContainer = document.getElementById('leFormTabs');
  if (!tabContainer) return;

  const buttons = tabContainer.querySelectorAll('.le-form-tab');
  buttons.forEach(btn => {
    const el = btn as HTMLElement;
    const tabKey = el.dataset.form as FormTab;
    el.classList.toggle('active', tabKey === activeFormTab);

    // Show dot indicator if this tab has data
    let hasData = false;
    if (tabKey === 'variation') {
      hasData = variationsData.some(vd => hasAnyFill(vd));
    } else {
      const fd = formsData[tabKey];
      hasData = fd ? hasAnyFill(fd) : false;
    }
    el.classList.toggle('has-data', hasData && tabKey !== activeFormTab);
  });
}

// ─── Variation Sub-Tabs ────────────────────────────────

/** Rebuilds the variation sub-tab buttons */
function updateVarSubTabs(): void {
  const container = document.getElementById('leVarTabs');
  const list = document.getElementById('leVarList');
  const delBtn = document.getElementById('leVarDel');
  if (!container || !list) return;

  // Show/hide variation sub-tabs
  container.style.display = activeFormTab === 'variation' ? '' : 'none';

  if (activeFormTab !== 'variation') return;

  // Rebuild sub-tab buttons
  list.innerHTML = '';
  for (let i = 0; i < variationsData.length; i++) {
    const btn = document.createElement('button');
    btn.className = 'le-var-tab' + (i === activeVariationIdx ? ' active' : '');
    btn.dataset.vidx = String(i);
    btn.textContent = `V${i + 1}`;

    // Dot indicator for non-active variations with data
    if (i !== activeVariationIdx && hasAnyFill(variationsData[i])) {
      btn.classList.add('has-data');
    }

    list.appendChild(btn);
  }

  // Hide delete button if only 1 variation
  if (delBtn) {
    delBtn.style.display = variationsData.length <= 1 ? 'none' : '';
  }
}

/** Switch to a different variation index */
function switchVariation(idx: number): void {
  if (idx < 0 || idx >= variationsData.length) return;
  // Save current variation
  if (activeVariationIdx < variationsData.length) {
    variationsData[activeVariationIdx] = {
      w: gridW, h: gridH,
      m: cellMatrix.map(r => [...r]),
      gH: gHMatrix.map(r => [...r]),
      gV: gVMatrix.map(r => [...r]),
      gD: gDMatrix.map(r => [...r]),
    };
  }

  activeVariationIdx = idx;
  loadTabData('variation');
  updateVarSubTabs();
  buildEditorGrid();
}

/** Add a new empty variation */
function addVariation(): void {
  // Save current first
  if (activeFormTab === 'variation' && activeVariationIdx < variationsData.length) {
    variationsData[activeVariationIdx] = {
      w: gridW, h: gridH,
      m: cellMatrix.map(r => [...r]),
      gH: gHMatrix.map(r => [...r]),
      gV: gVMatrix.map(r => [...r]),
      gD: gDMatrix.map(r => [...r]),
    };
  }

  variationsData.push(makeEmptyFormData());
  activeVariationIdx = variationsData.length - 1;
  loadTabData('variation');
  updateVarSubTabs();
  buildEditorGrid();
}

/** Delete the current variation */
function deleteVariation(): void {
  if (variationsData.length <= 1) return;

  variationsData.splice(activeVariationIdx, 1);
  if (activeVariationIdx >= variationsData.length) {
    activeVariationIdx = variationsData.length - 1;
  }
  loadTabData('variation');
  updateVarSubTabs();
  buildEditorGrid();
}

/** Creates an empty 5×5 FormData */
function makeEmptyFormData(): FormData {
  return {
    w: 5, h: 5,
    m: Array.from({ length: 5 }, () => new Array(5).fill(0)),
    gH: Array.from({ length: 5 }, () => new Array(5).fill(0)),
    gV: Array.from({ length: 5 }, () => new Array(5).fill(0)),
    gD: Array.from({ length: 5 }, () => new Array(5).fill(0)),
  };
}

/** Checks if a FormData has any filled cells */
function hasAnyFill(fd: FormData): boolean {
  for (const row of fd.m) {
    for (const v of row) {
      if (v) return true;
    }
  }
  return false;
}

// ─── Grid Rendering ────────────────────────────────────

/** Fixed pixel sizes for editor grid elements */
const CELL_PX = 30;
const GAP_PX = 10;
const RADIUS = 5;

function buildEditorGrid(): void {
  editorGrid = document.getElementById('leEditorGrid');
  if (!editorGrid) return;
  editorGrid.innerHTML = '';

  const totalCols = gridW * 2;
  const totalRows = gridH * 2;

  editorGrid.style.gridTemplateColumns =
    Array.from({ length: totalCols }, (_, i) => (i % 2 === 0) ? `${CELL_PX}px` : `${GAP_PX}px`).join(' ');
  editorGrid.style.gridTemplateRows =
    Array.from({ length: totalRows }, (_, i) => (i % 2 === 0) ? `${CELL_PX}px` : `${GAP_PX}px`).join(' ');

  editorGrid.style.aspectRatio = 'unset';
  editorGrid.style.width = 'fit-content';

  for (let gr = 0; gr < totalRows; gr++) {
    for (let gc = 0; gc < totalCols; gc++) {
      const isEvenR = gr % 2 === 0;
      const isEvenC = gc % 2 === 0;

      if (isEvenR && isEvenC) {
        const r = gr / 2, c = gc / 2;
        const el = document.createElement('div');
        el.className = 'le-cell' + (cellMatrix[r]?.[c] ? ' filled' : '');
        el.dataset.type = 'cell';
        el.dataset.r = String(r);
        el.dataset.c = String(c);
        el.style.gridColumn = String(gc + 1);
        el.style.gridRow = String(gr + 1);
        addPaintListeners(el);
        editorGrid.appendChild(el);

      } else if (isEvenR && !isEvenC) {
        const r = gr / 2, c = (gc - 1) / 2;
        const el = document.createElement('div');
        el.className = 'le-gV' + (gVMatrix[r]?.[c] ? ' filled' : '');
        el.dataset.type = 'gV';
        el.dataset.r = String(r);
        el.dataset.c = String(c);
        el.style.gridColumn = String(gc + 1);
        el.style.gridRow = String(gr + 1);
        addPaintListeners(el);
        editorGrid.appendChild(el);

      } else if (!isEvenR && isEvenC) {
        const r = (gr - 1) / 2, c = gc / 2;
        const el = document.createElement('div');
        el.className = 'le-gH' + (gHMatrix[r]?.[c] ? ' filled' : '');
        el.dataset.type = 'gH';
        el.dataset.r = String(r);
        el.dataset.c = String(c);
        el.style.gridColumn = String(gc + 1);
        el.style.gridRow = String(gr + 1);
        addPaintListeners(el);
        editorGrid.appendChild(el);

      } else {
        const r = (gr - 1) / 2, c = (gc - 1) / 2;
        const el = document.createElement('div');
        el.className = 'le-gD' + (gDMatrix[r]?.[c] ? ' filled' : '');
        el.dataset.type = 'gD';
        el.dataset.r = String(r);
        el.dataset.c = String(c);
        el.style.gridColumn = String(gc + 1);
        el.style.gridRow = String(gr + 1);
        addPaintListeners(el);
        editorGrid.appendChild(el);
      }
    }
  }

  refreshRadius();
}

function addPaintListeners(el: HTMLElement): void {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    isPointerDown = true;
    paintElement(el);
  });
  el.addEventListener('pointerenter', () => {
    if (isPointerDown) paintElement(el);
  });
}

function paintElement(el: HTMLElement): void {
  const type = el.dataset.type;
  const r = parseInt(el.dataset.r || '0');
  const c = parseInt(el.dataset.c || '0');
  const val = editorTool === 'draw' ? 1 : 0;

  switch (type) {
    case 'cell':
      cellMatrix[r][c] = val;
      break;
    case 'gH':
      if (gHMatrix[r]) gHMatrix[r][c] = val;
      break;
    case 'gV':
      if (gVMatrix[r]) gVMatrix[r][c] = val;
      break;
    case 'gD':
      if (gDMatrix[r]) gDMatrix[r][c] = val;
      break;
  }

  el.classList.toggle('filled', val === 1);
  refreshRadius();
}

// ─── Adaptive Border Radius ────────────────────────────

function isGH(r: number, c: number): boolean { return !!(gHMatrix[r]?.[c]); }
function isGV(r: number, c: number): boolean { return !!(gVMatrix[r]?.[c]); }
function isGD(r: number, c: number): boolean { return !!(gDMatrix[r]?.[c]); }
function isCell(r: number, c: number): boolean { return !!(cellMatrix[r]?.[c]); }

function refreshRadius(): void {
  if (!editorGrid) return;
  const R = RADIUS;
  const rGap = Math.min(R, Math.floor(GAP_PX / 2));

  const els = editorGrid.children;
  for (let i = 0; i < els.length; i++) {
    const el = els[i] as HTMLElement;
    const type = el.dataset.type;
    const r = parseInt(el.dataset.r || '0');
    const c = parseInt(el.dataset.c || '0');

    if (type === 'cell') {
      if (!cellMatrix[r]?.[c]) { el.style.borderRadius = ''; continue; }
      const tl = (isGV(r, c - 1) || isGH(r - 1, c) || isGD(r - 1, c - 1)) ? 0 : R;
      const tr = (isGV(r, c)     || isGH(r - 1, c) || isGD(r - 1, c))     ? 0 : R;
      const br = (isGV(r, c)     || isGH(r, c)     || isGD(r, c))         ? 0 : R;
      const bl = (isGV(r, c - 1) || isGH(r, c)     || isGD(r, c - 1))     ? 0 : R;
      el.style.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;

    } else if (type === 'gH') {
      if (!gHMatrix[r]?.[c]) { el.style.borderRadius = ''; continue; }
      const tl = (isCell(r, c)     || isGV(r, c - 1) || isGD(r, c - 1)) ? 0 : rGap;
      const tr = (isCell(r, c)     || isGV(r, c)     || isGD(r, c))     ? 0 : rGap;
      const br = (isCell(r + 1, c) || isGV(r + 1, c) || isGD(r, c))     ? 0 : rGap;
      const bl = (isCell(r + 1, c) || isGV(r + 1, c - 1) || isGD(r, c - 1)) ? 0 : rGap;
      el.style.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;

    } else if (type === 'gV') {
      if (!gVMatrix[r]?.[c]) { el.style.borderRadius = ''; continue; }
      const tl = (isCell(r, c)     || isGH(r - 1, c) || isGD(r - 1, c)) ? 0 : rGap;
      const tr = (isCell(r, c + 1) || isGH(r - 1, c + 1) || isGD(r - 1, c)) ? 0 : rGap;
      const br = (isCell(r, c + 1) || isGH(r, c + 1) || isGD(r, c))     ? 0 : rGap;
      const bl = (isCell(r, c)     || isGH(r, c)     || isGD(r, c))     ? 0 : rGap;
      el.style.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;

    } else if (type === 'gD') {
      if (!gDMatrix[r]?.[c]) { el.style.borderRadius = ''; continue; }
      const tl = (isCell(r, c)     || isGH(r, c)     || isGV(r, c))     ? 0 : rGap;
      const tr = (isCell(r, c + 1) || isGH(r, c + 1) || isGV(r, c))     ? 0 : rGap;
      const br = (isCell(r + 1, c + 1) || isGH(r, c + 1) || isGV(r + 1, c)) ? 0 : rGap;
      const bl = (isCell(r + 1, c) || isGH(r, c)     || isGV(r + 1, c)) ? 0 : rGap;
      el.style.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;
    }
  }
}

// ─── Matrix Helpers ────────────────────────────────────

function initMatrices(): void {
  cellMatrix = Array.from({ length: gridH }, () => new Array(gridW).fill(0));
  gHMatrix = Array.from({ length: gridH }, () => new Array(gridW).fill(0));
  gVMatrix = Array.from({ length: gridH }, () => new Array(gridW).fill(0));
  gDMatrix = Array.from({ length: gridH }, () => new Array(gridW).fill(0));
}

function resizeMatrices(newW: number, newH: number): void {
  const oldCM = cellMatrix, oldGH = gHMatrix, oldGV = gVMatrix, oldGD = gDMatrix;
  const oldH = gridH, oldW = gridW;
  gridW = newW;
  gridH = newH;
  initMatrices();

  const minH = Math.min(oldH, newH);
  const minW = Math.min(oldW, newW);
  for (let r = 0; r < minH; r++) {
    for (let c = 0; c < minW; c++) {
      cellMatrix[r][c] = oldCM[r]?.[c] || 0;
      gHMatrix[r][c] = oldGH[r]?.[c] || 0;
      gVMatrix[r][c] = oldGV[r]?.[c] || 0;
      gDMatrix[r][c] = oldGD[r]?.[c] || 0;
    }
  }
}

// ─── Modal Show/Hide ───────────────────────────────────

function showModal(): void {
  if (modal) modal.classList.add('open');
}

function hideModal(): void {
  if (modal) modal.classList.remove('open');
  isPointerDown = false;
}
