# Bayesian-Network-Program

A browser-based Bayesian Network editor focused on usability.

## Node types
- **Evidence**
- **Hypothesis**

## What was improved
- **File open/import fixed**:
  - Open a save file from the file picker.
  - Drag-and-drop a `.json` save file onto the drop zone.
- **Arrow editing improved**:
  - Dedicated **Draw Arrow Tool** (no accidental auto-attach while moving nodes).
  - Click an arrow to select it independently from nodes.
  - Selected arrows can be deleted directly.
  - Selected arrows expose a **bend handle** and bend slider for easier visual editing.
- **State editing improved**:
  - Default states are now `Present` and `Absent` (instead of `True`/`False`).
  - Add states with spaces (e.g., `Very likely`).
  - Remove states from pills without rewriting the whole field.

## Other features
- Drag nodes to arrange the network.
- DAG cycle prevention when creating arrows.
- CPT editing for each parent combination.
- Exact inference by enumeration.
- Plain-language summary, e.g.:
  - "The probability of Disease Risk being High given Fever and Cough is 82.50%."
- Save to JSON and quick save/load in `localStorage`.

## Run
```bash
python3 -m http.server 8080
```
Then open: `http://localhost:8080`.
