# Bayesian-Network-Program

A browser-based Bayesian Network editor with two focused node types:

- **Evidence** nodes
- **Hypothesis** nodes

## Features

- Visual node creation with drag-and-drop layout.
- Directed arrows with clear arrowheads and smooth follow-through curves.
- DAG cycle prevention when connecting nodes.
- Inspector to edit node names, states, evidence assignment, and CPT values.
- Exact inference by enumeration.
- Plain-language summary sentences for hypothesis results, e.g.:
  - "The probability of Flu being True given Fever and Cough is 82.50%."
- Save current model to JSON.
- Upload JSON save state and restore model.
- Quick save/load through browser localStorage.

## Run locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.
