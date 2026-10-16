/**
 * LetterEditor — Modal-based interactive letter editor.
 * Create, edit, and delete custom Kufic letter definitions.
 * Supports drawing/erasing cells + gap bridges via DOM grid.
 */

import type { LetterEntry } from '../types/grid';

export interface LetterEditorCallbacks {
  /** Called when a letter is saved. ch is the letter key. */
  onSave(ch: string, entry: LetterEntry): void;
  /** Called when a letter is deleted. ch is the letter key. */
  onDelete(ch: string): void;
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

  buildEditorGrid();
  showModal();
}

/**
 * Opens editor with an existing letter for editing.
 */
export function openEditLetter(ch: string, entry: LetterEntry): void {
  editingCh = ch;

  const m = entry.m;
  gridH = m.length;
  gridW = m[0]?.length || 1;
  initMatrices();

  // Copy data
  for (let r = 0; r < gridH; r++) {
    for (let c = 0; c < gridW; c++) {
      cellMatrix[r][c] = m[r]?.[c] || 0;
    }
  }
  if (entry.gH) for (let r = 0; r < gridH - 1; r++) {
    for (let c = 0; c < gridW; c++) {
      gHMatrix[r][c] = entry.gH[r]?.[c] || 0;
    }
  }
  if (entry.gV) for (let r = 0; r < gridH; r++) {
    for (let c = 0; c < gridW - 1; c++) {
      gVMatrix[r][c] = entry.gV[r]?.[c] || 0;
    }
  }
  if (entry.gD) for (let r = 0; r < gridH - 1; r++) {
    for (let c = 0; c < gridW - 1; c++) {
      gDMatrix[r][c] = entry.gD[r]?.[c] || 0;
    }
  }

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

  overlay.innerHTML = `
    <div class="modal-box le-panel">
      <div class="le-header">
        <h3>Letter Editor</h3>
        <button class="le-close-btn" id="leClose" title="Close">✕</button>
      </div>

      <div class="le-meta">
        <div class="le-meta-row">
          <label>Char</label>
          <input type="text" id="leChar" maxlength="4" placeholder="ب" />
          <label>Name</label>
          <input type="text" id="leName" placeholder="ba" />
        </div>
      </div>

      <div class="le-grid-controls">
        <label>W</label>
        <input type="number" id="leGridW" min="1" max="20" value="5" />
        <label>H</label>
        <input type="number" id="leGridH" min="1" max="20" value="5" />
        <button class="s-btn sm" id="leResizeBtn">Apply</button>
        <button class="s-btn sm" id="leClearBtn">Clear</button>
      </div>

      <div class="le-tools">
        <button class="s-btn sm active" id="leToolDraw">Draw</button>
        <button class="s-btn sm" id="leToolErase">Erase</button>
      </div>

      <div class="le-editor-wrap">
        <div id="leEditorGrid" class="le-editor-grid"></div>
      </div>

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

  save?.addEventListener('click', () => {
    const charInput = document.getElementById('leChar') as HTMLInputElement;
    const nameInput = document.getElementById('leName') as HTMLInputElement;
    const ch = charInput?.value.trim();
    if (!ch) { charInput?.focus(); return; }

    const entry: LetterEntry = {
      ch,
      name: nameInput?.value.trim() || ch,
      m: cellMatrix.map(r => [...r]),
      gH: gHMatrix.map(r => [...r]),
      gV: gVMatrix.map(r => [...r]),
      gD: gDMatrix.map(r => [...r]),
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

  // Pointer up anywhere stops painting
  document.addEventListener('pointerup', () => { isPointerDown = false; });
}

// ─── Grid Rendering ────────────────────────────────────

function buildEditorGrid(): void {
  editorGrid = document.getElementById('leEditorGrid');
  if (!editorGrid) return;
  editorGrid.innerHTML = '';

  // Use CSS grid: each cell occupies a 2x2 area (cell + gaps between)
  // Grid template: col pattern = [cellW gapW] * cols - last gapW
  // Total CSS-grid columns = gridW * 2 - 1
  // Total CSS-grid rows    = gridH * 2 - 1
  const totalCols = gridW * 2 - 1;
  const totalRows = gridH * 2 - 1;

  editorGrid.style.gridTemplateColumns =
    Array.from({ length: totalCols }, (_, i) => (i % 2 === 0) ? '1fr' : '8px').join(' ');
  editorGrid.style.gridTemplateRows =
    Array.from({ length: totalRows }, (_, i) => (i % 2 === 0) ? '1fr' : '8px').join(' ');

  for (let gr = 0; gr < totalRows; gr++) {
    for (let gc = 0; gc < totalCols; gc++) {
      const isEvenR = gr % 2 === 0;
      const isEvenC = gc % 2 === 0;

      if (isEvenR && isEvenC) {
        // Main cell
        const r = gr / 2, c = gc / 2;
        const el = document.createElement('div');
        el.className = 'le-cell' + (cellMatrix[r][c] ? ' filled' : '');
        el.dataset.type = 'cell';
        el.dataset.r = String(r);
        el.dataset.c = String(c);
        el.style.gridColumn = String(gc + 1);
        el.style.gridRow = String(gr + 1);
        addPaintListeners(el);
        editorGrid.appendChild(el);

      } else if (isEvenR && !isEvenC) {
        // gapV: between cell (r, c) and cell (r, c+1)
        const r = gr / 2, c = (gc - 1) / 2;
        if (c < gridW - 1) {
          const el = document.createElement('div');
          el.className = 'le-gV' + (gVMatrix[r]?.[c] ? ' filled' : '');
          el.dataset.type = 'gV';
          el.dataset.r = String(r);
          el.dataset.c = String(c);
          el.style.gridColumn = String(gc + 1);
          el.style.gridRow = String(gr + 1);
          addPaintListeners(el);
          editorGrid.appendChild(el);
        }

      } else if (!isEvenR && isEvenC) {
        // gapH: between cell (r, c) and cell (r+1, c)
        const r = (gr - 1) / 2, c = gc / 2;
        if (r < gridH - 1) {
          const el = document.createElement('div');
          el.className = 'le-gH' + (gHMatrix[r]?.[c] ? ' filled' : '');
          el.dataset.type = 'gH';
          el.dataset.r = String(r);
          el.dataset.c = String(c);
          el.style.gridColumn = String(gc + 1);
          el.style.gridRow = String(gr + 1);
          addPaintListeners(el);
          editorGrid.appendChild(el);
        }

      } else {
        // gapD: diagonal corner
        const r = (gr - 1) / 2, c = (gc - 1) / 2;
        if (r < gridH - 1 && c < gridW - 1) {
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
  }
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
}

// ─── Matrix Helpers ────────────────────────────────────

function initMatrices(): void {
  cellMatrix = Array.from({ length: gridH }, () => new Array(gridW).fill(0));
  gHMatrix = Array.from({ length: Math.max(0, gridH - 1) }, () => new Array(gridW).fill(0));
  gVMatrix = Array.from({ length: gridH }, () => new Array(Math.max(0, gridW - 1)).fill(0));
  gDMatrix = Array.from({ length: Math.max(0, gridH - 1) }, () => new Array(Math.max(0, gridW - 1)).fill(0));
}

function resizeMatrices(newW: number, newH: number): void {
  const oldCM = cellMatrix, oldGH = gHMatrix, oldGV = gVMatrix, oldGD = gDMatrix;
  const oldH = gridH, oldW = gridW;
  gridW = newW;
  gridH = newH;
  initMatrices();

  // Preserve existing data within new bounds
  const minH = Math.min(oldH, newH);
  const minW = Math.min(oldW, newW);
  for (let r = 0; r < minH; r++) {
    for (let c = 0; c < minW; c++) {
      cellMatrix[r][c] = oldCM[r]?.[c] || 0;
    }
  }
  const minGHR = Math.min(Math.max(0, oldH - 1), Math.max(0, newH - 1));
  for (let r = 0; r < minGHR; r++) {
    for (let c = 0; c < minW; c++) {
      gHMatrix[r][c] = oldGH[r]?.[c] || 0;
    }
  }
  const minGVC = Math.min(Math.max(0, oldW - 1), Math.max(0, newW - 1));
  for (let r = 0; r < minH; r++) {
    for (let c = 0; c < minGVC; c++) {
      gVMatrix[r][c] = oldGV[r]?.[c] || 0;
    }
  }
  for (let r = 0; r < minGHR; r++) {
    for (let c = 0; c < minGVC; c++) {
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
