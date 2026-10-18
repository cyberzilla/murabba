<div align="center">

# Murabba ✦ مُرَبَّع

**Square Kufic Calligraphy Editor**

A free, open-source browser tool for designing Square Kufic (الخط الكوفي المربع) calligraphy.

🔗 **[Live Demo](https://cyberzilla.github.io/murabba)**

</div>

---

## Features

- 🎨 **Canvas-based editor** — HTML5 Canvas 2D rendering with viewport frustum culling
- 📐 **Customizable grid** — cell size, gap size, corner radius, axis guides
- ✍️ **Multiple drawing tools** — Draw, Erase, Fill, Brush (3 modes), Select, Pan
- ✂️ **Selection tool** — marquee select, drag-to-move, shift+drag to reposition frame, copy/cut/paste, right-click to stamp
- 🔄 **Transform** — rotate CW/CCW, flip horizontal/vertical via toolbar buttons or keyboard shortcuts
- 🔤 **Letter library** — 41 letters including Arabic and Jawi script (چ ڠ ڤ ڬ ۋ ڽ) with positional forms (isolated, initial, medial, final), floating preview for positioning
- ✏️ **Letter editor** — create and edit letter forms with multiple variations, sub-cell marks (kaf-s zigzag, hamzah C-shape)
- 🎯 **Sub-cell marks** — decorative marks with independent color, rotation, and flip — rendered on both canvas and SVG export
- 🖼️ **Reference image** — overlay any image for tracing with rotation, crop, opacity, blend modes
- 📦 **Smart export** — PNG (transparent when no background), SVG (with marks, transforms, embedded background), WebP, EPS
- 💾 **Save & Load** — JSON project files with auto-save and session restore on refresh
- 🔄 **Undo / Redo** — up to 60 history states, synced toolbar & keyboard shortcuts
- 📋 **Clipboard** — copy, cut, paste selections with full mark and color preservation
- 🌍 **Multilingual** — English, العربية, Indonesia — no flash on page load
- 🏠 **Welcome screen** — new project, open file, continue last session — with state persistence
- 🌗 **Light / Dark theme** — toggle with one click, preference saved in localStorage, no flash on reload
- ✅ **File validation** — warns on invalid file format when loading projects or importing libraries

## Tech Stack

- **TypeScript** — fully typed codebase, zero errors
- **Vite** — fast build and HMR development
- **HTML5 Canvas 2D** — hardware-accelerated rendering
- **IndexedDB + localStorage** — persistent storage

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm

### Installation

```bash
npm install
```

### Development

```bash
npx vite --port 3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npx vite build
```

Output will be in the `docs/` directory (for GitHub Pages deployment).

## How to Use

1. Open the app in any modern browser
2. Configure grid dimensions from the **sidebar**
3. Select a drawing tool (Draw, Erase, Fill, Brush, Select, Pan)
4. Pick a color from the **palette**
5. Draw by clicking/dragging on the canvas
6. Add letters from the **Letters** panel — they appear as a floating preview you can position before committing
7. Use **Select** tool to move content: drag inside selection to cut & move, Shift+drag to reposition frame only
8. **Transform** floating selections: rotate (R/Shift+R) or flip (X/Y) using toolbar buttons or keyboard
9. Export your work as **PNG**, **SVG**, **WebP**, or **EPS** — background is automatically included when present
10. Click the **✦ Murabba** logo to return to the welcome screen

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Tools** | |
| `V` | Cursor |
| `B` | Draw tool |
| `E` | Erase tool |
| `F` | Fill tool |
| `W` | Brush tool |
| `H` | Pan tool |
| `S` | Select tool |
| **Actions** | |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+C` | Copy selection |
| `Ctrl+X` | Cut selection |
| `Ctrl+V` | Paste |
| `Ctrl+S` | Export PNG |
| `Delete` | Erase selection content |
| **Transform** | |
| `R` | Rotate selection CW |
| `Shift+R` | Rotate selection CCW |
| `X` | Flip selection horizontal |
| `Y` | Flip selection vertical |
| **Navigation** | |
| `Ctrl+Scroll` | Zoom in/out |
| `Arrow keys` | Nudge selection |
| `Enter` | Commit/stamp selection |
| `Escape` | Cancel selection |

## Project Structure

```
src/
├── core/           # Grid model, coordinate mapper, history, radius calc
├── canvas/         # Canvas renderers (grid, selection, marks, background, export)
├── tools/          # Drawing tools (draw, fill, brush, select, pan, cursor)
├── storage/        # IndexedDB, session manager, project I/O
├── i18n/           # Internationalization (en, ar, id)
├── letters/        # Letter library loader
├── ui/             # App controller, about modal, confirm modal, letter editor
├── types/          # TypeScript type definitions
├── utils/          # Math and color utilities
└── index.ts        # Entry point
```

## License

[MIT License](LICENSE)
