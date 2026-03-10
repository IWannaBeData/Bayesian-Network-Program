# Bayesian-Network-Program

A browser-based Bayesian Network editor with automatic evidence assumptions and easier multi-selection workflows.

## Latest behavior updates

- Clicking empty canvas now automatically switches back to **Select** tool.
- Removed UI hue selector; kept node brightness only.
- Renamed left panel section from **Persistence** to **File**.
- Added **Light Grid** toggle for the canvas background.
- Multi-select support for nodes and arrows:
  - Shift+click multiple nodes/arrows.
  - Highlight all nodes quickly.
  - Move highlighted nodes together.
  - Summary panel reflects selected subnetwork when there is a selection.
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
