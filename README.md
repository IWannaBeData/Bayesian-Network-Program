# Bayesian-Network-Program

A browser-based Bayesian Network editor with a lighter visual style and easier graph interaction.

## What changed in this revision

- Fixed interaction stability for connecting nodes so pressing/clicking nodes no longer makes boxes disappear.
- Added smoother navigation for larger networks:
  - Pan by dragging empty canvas.
  - Zoom with mouse wheel.
  - Reset pan/zoom button.
- Added a **Color Adjustor**:
  - UI hue slider.
  - Node brightness slider.
- Added node heat coloring (when applicable):
  - For binary-state nodes, after inference the node color becomes a gradient from **Red (False-like / low probability of first state)** to **Green (True-like / high probability of first state)**.
- Kept robust save/load:
  - Open file picker import.
  - Drag-and-drop `.json` import.
  - Save to file and quick local save/load.

## Node types
- Evidence
- Hypothesis

## Run
```bash
python3 -m http.server 8080
```
Open `http://localhost:8080`.
