# Bayesian-Network-Program

A browser-based Bayesian Network editor with automatic evidence assumptions and easier multi-selection workflows.

## Latest behavior updates

- Clicking empty canvas now automatically switches back to **Select** tool.
- To pan/move the grid/network, hold **Ctrl** while dragging on empty canvas.
- Removed UI/brightness color sliders for a cleaner workflow.
- Removed the View/Reset section from the UI.
- Renamed left panel section from **Persistence** to **File**.
- Added a default light grid in the canvas background.
- Arrows can be manually drawn by drag-stretching from source node to target node connection point.
- PowerPoint-style connector ports are shown on nodes for easier snapping while drawing.
- Arrow head can be dragged and snapped to node connection points (four corners + side centers).
- A visual snap marker appears on the target connection point during drag.
- Multi-select support for nodes and arrows:
  - Shift+click multiple nodes/arrows.
  - Move highlighted nodes together.
  - Summary panel reflects selected subnetwork when there is a selection.
- Added a dedicated **Highlight** tool (PowerPoint-style) to click-toggle persistent highlights on both boxes and arrows.
- Added **Highlight All** and **Clear Highlights** to quickly emphasize/reset the whole diagram.
- Keyboard tool shortcuts: **V** = Select, **A** = Draw Arrow, **H** = Highlight.
- Added role detection showing `evidence/hypothesis` when a node is both upstream and downstream.
- Added **Probability of [state]** selector in inspector so you can inspect one selected state directly.
- Evidence nodes are assumed true/present by default in inference.
- Hypothesis defaults to `True/False`; Evidence defaults to `Present/Absent`.

## File
- Save JSON
- Open JSON
- Drag/drop JSON
- Quick save/load in localStorage

## Run
```bash
python3 -m http.server 8080
```
Open `http://localhost:8080`.
