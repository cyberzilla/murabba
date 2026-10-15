<div align="center">

# Murabba ✦ مُرَبَّع

**Square Kufic Calligraphy Editor**

A free, open-source browser tool for designing Square Kufic (الخط الكوفي المربع) calligraphy.

</div>

---

## Features

- 🎨 **Canvas-based editor** — HTML5 Canvas 2D rendering with viewport frustum culling
- 📐 **Customizable grid** — cell size, gap size, corner radius, axis guides
- ✍️ **Multiple drawing tools** — Draw, Fill, Brush (3 modes), Select, Pan
- ✂️ **Selection tool** — marquee select, drag-to-move content, shift+drag to reposition frame, right-click to stamp, arrow keys to nudge
- 🔤 **Letter library** — letters appear as floating preview for positioning before commit
- 🖼️ **Reference image** — overlay any image for tracing with rotation, crop, opacity, blend modes
- 📦 **Smart export** — PNG (transparent when no background), SVG (with embedded background image), WebP — auto-includes background when present
- 💾 **Save & Load** — JSON project files with auto-save and session restore on refresh
- 🔄 **Undo / Redo** — up to 60 history states, synced toolbar & keyboard shortcuts
- 🌍 **Multilingual** — English, العربية, Indonesia — no flash on page load
- 🏠 **Welcome screen** — new project, open file, continue last session — with state persistence
- 🎨 **Dark theme** — modern dark UI with customizable color palette and quick swatches

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

Output will be in the `dist/` directory.

## How to Use

1. Open the app in any modern browser
2. Configure grid dimensions from the **sidebar**
3. Select a drawing tool (Draw, Fill, Brush, Select, Pan)
4. Pick a color from the **palette**
5. Draw by clicking/dragging on the canvas
6. Add letters from the **Letters** panel — they appear as a floating preview you can position before committing
7. Use **Select** tool to move content: drag inside selection to cut & move, Shift+drag to reposition frame only
8. Export your work as **PNG**, **SVG**, or **WebP** — background is automatically included when present
9. Click the **✦ Murabba** logo to return to the welcome screen

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `B` | Draw tool |
| `E` | Erase tool |
| `F` | Fill tool |
| `W` | Brush tool |
| `S` | Select tool |
| `H` | Pan tool |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Export PNG |
| `Arrow keys` | Nudge selection |
| `Enter` | Commit/stamp selection |
| `Escape` | Cancel selection |
| `Delete` | Erase selection content |

## Project Structure

```
src/
├── core/           # Grid model, coordinate mapper, history, radius calc
├── canvas/         # Canvas renderers (grid, selection, background, export)
├── tools/          # Drawing tools (draw, fill, brush, select, pan)
├── storage/        # IndexedDB, session manager, project I/O
├── i18n/           # Internationalization (en, ar, id)
├── ui/             # App controller, confirm modal
├── types/          # TypeScript type definitions
├── utils/          # Math and color utilities
└── index.ts        # Entry point
```

## License

[MIT License](LICENSE)
