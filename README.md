# Bayesian-Network-Program

A browser-based Bayesian Network editor with a brighter interface and easier graph manipulation.

## Latest UX fixes

- Arrows are now much easier to interact with:
  - Larger invisible hit area for arrow selection.
  - Drag arrow directly to bend manually (no bend slider/handle needed).
- Added keyboard delete shortcut:
  - Press **Backspace** to delete selected node or arrow.
- Improved box connection behavior:
  - More anchor points around each node edge for cleaner routing.
- Node state defaults are now type-specific:
  - **Hypothesis** defaults to `True` / `False`.
  - **Evidence** defaults to `Present` / `Absent`.
- Kept pan/zoom and color controls:
  - Pan canvas, zoom with wheel, reset view.
  - UI hue, node brightness, and green↔red probability coloring.

## Persistence
- Save model to JSON file.
- Open JSON save file.
- Drag/drop JSON save file.
- Quick save/load in local storage.

## Run
```bash
python3 -m http.server 8080
```
Open `http://localhost:8080`.
