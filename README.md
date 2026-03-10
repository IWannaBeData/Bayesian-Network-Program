# Bayesian-Network-Program

A browser-based Bayesian Network editor with improved node/arrow ergonomics and automatic evidence assumptions.

## Latest behavior updates

- **Automatic evidence assumption**
  - Evidence nodes default to `Present` and are treated as true/present during inference if not manually changed.
- **Automatic green↔red coloring**
  - Heat coloring now updates automatically from inferred probabilities (no separate apply button).
- **Type-specific defaults**
  - Hypothesis defaults to `True/False`.
  - Evidence defaults to `Present/Absent`.
- **Influence-aware CPT initialization**
  - Parent links now initialize binary CPTs with positive influence so added evidence/hypothesis parents raise the first state probability.
- **Arrow manipulation improvements**
  - Larger arrow hit targets.
  - Manual arrow bending by dragging the arrow directly.
  - Delete selected node/arrow with Backspace/Delete.
- **Multi-node highlight move**
  - Shift+Click nodes to highlight.
  - `Highlight All Nodes` to select all.
  - Drag one highlighted node to move all highlighted nodes together.

## Persistence
- Save JSON, open JSON, drag/drop JSON, and quick save/load in localStorage.

## Run
```bash
python3 -m http.server 8080
```
Open `http://localhost:8080`.
