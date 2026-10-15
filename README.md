<div align="center">

# Murabba ✦ مُرَبَّع

**Square Kufic Calligraphy Editor**

A free, open-source browser tool for designing Square Kufic (الخط الكوفي المربع) calligraphy.

</div>

---

## Features

- 🎨 **Canvas-based editor** — HTML5 Canvas 2D rendering for smooth performance
- 📐 **Customizable grid** — cell size, gap size, corner radius, axis guides
- ✍️ **Multiple drawing tools** — Draw, Fill, Brush (3 modes), Select, Pan
- 🔤 **Letter library** — save and reuse letter/glyph designs
- 🖼️ **Reference image** — overlay any image for tracing
- 📦 **Multi-format export** — PNG, SVG (vector), and WebP
- 💾 **Save & Load** — JSON project files with auto-save
- 🔄 **Undo / Redo** — up to 60 history states
- 🌍 **Multilingual** — English, العربية, Indonesia
- 📱 **Responsive** — works on desktop and mobile
- 🎨 **Dark theme** — modern dark UI with customizable color palette

## Tech Stack

- **TypeScript** — fully typed codebase
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
6. Add letters from the **Letters** panel
7. Export your work as **PNG**, **SVG**, or **WebP**

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
