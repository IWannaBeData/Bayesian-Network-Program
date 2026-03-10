const NODE_WIDTH = 142;
const NODE_HEIGHT = 56;

const state = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  connectMode: false,
  pendingParentId: null,
  drag: null,
};

const canvas = document.getElementById('canvas');
const edgeLayer = document.getElementById('edgeLayer');
const inspector = document.getElementById('inspector');
const emptySelection = document.getElementById('emptySelection');
const nodeNameInput = document.getElementById('nodeName');
const nodeTypeInput = document.getElementById('nodeType');
const evidenceSelect = document.getElementById('evidenceSelect');
const stateInput = document.getElementById('stateInput');
const cptContainer = document.getElementById('cptContainer');
const inferenceOutput = document.getElementById('inferenceOutput');
const summaryOutput = document.getElementById('summaryOutput');

function setupEvents() {
  document.querySelectorAll('[data-add-node]').forEach((btn) => {
    btn.addEventListener('click', () => addNode(btn.dataset.addNode));
  });

  document.getElementById('connectModeBtn').addEventListener('click', () => {
    state.connectMode = !state.connectMode;
    state.pendingParentId = null;
    updateConnectModeVisual();
  });

  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelectedNode);
  document.getElementById('applyStatesBtn').addEventListener('click', applyStates);
  document.getElementById('runInferenceBtn').addEventListener('click', runInference);
  document.getElementById('saveFileBtn').addEventListener('click', saveToFile);
  document.getElementById('quickSaveBtn').addEventListener('click', quickSave);
  document.getElementById('quickLoadBtn').addEventListener('click', quickLoad);
  document.getElementById('uploadInput').addEventListener('change', uploadState);

  nodeNameInput.addEventListener('input', () => {
    const node = getSelectedNode();
    if (!node) return;
    node.name = nodeNameInput.value.trim() || node.name;
    render();
  });

  evidenceSelect.addEventListener('change', () => {
    const node = getSelectedNode();
    if (!node) return;
    node.evidence = evidenceSelect.value === '__none__' ? null : evidenceSelect.value;
  });

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', () => {
    state.drag = null;
  });
}

function addNode(type) {
  const id = crypto.randomUUID();
  const node = {
    id,
    type,
    name: type === 'evidence' ? `Evidence ${state.nodes.length + 1}` : `Hypothesis ${state.nodes.length + 1}`,
    x: 80 + Math.random() * 320,
    y: 80 + Math.random() * 240,
    states: ['True', 'False'],
    evidence: null,
    cpt: {},
  };
  state.nodes.push(node);
  initializeCpt(node);
  state.selectedNodeId = id;
  render();
}

function initializeCpt(node) {
  const combos = parentCombinations(getParents(node.id));
  node.cpt = {};
  combos.forEach((combo) => {
    node.cpt[combo.key] = uniform(node.states.length);
  });
}

function uniform(len) {
  return Array.from({ length: len }, () => Number((1 / len).toFixed(4)));
}

function render() {
  renderNodes();
  renderEdges();
  renderInspector();
}

function renderNodes() {
  canvas.querySelectorAll('.node').forEach((el) => el.remove());

  state.nodes.forEach((node) => {
    const el = document.createElement('div');
    el.className = `node ${node.type}` + (node.id === state.selectedNodeId ? ' selected' : '');
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.innerHTML = `<div class="title">${node.name}</div><div class="sub">${node.type}</div>`;

    el.addEventListener('mousedown', (event) => {
      if (state.connectMode) {
        handleConnectClick(node.id);
        return;
      }
      state.selectedNodeId = node.id;
      const rect = el.getBoundingClientRect();
      state.drag = {
        id: node.id,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      render();
    });

    el.addEventListener('click', () => {
      state.selectedNodeId = node.id;
      render();
    });

    canvas.appendChild(el);
  });
}

function onMouseMove(event) {
  if (!state.drag) return;
  const node = state.nodes.find((n) => n.id === state.drag.id);
  if (!node) return;
  const bounds = canvas.getBoundingClientRect();
  node.x = event.clientX - bounds.left - state.drag.offsetX;
  node.y = event.clientY - bounds.top - state.drag.offsetY;
  renderNodes();
  renderEdges();
}

function renderEdges() {
  edgeLayer.innerHTML = `
    <defs>
      <marker id="arrowHead" markerWidth="13" markerHeight="13" refX="12" refY="6.5" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,13 L12,6.5 z" fill="#b9d5ff" />
      </marker>
    </defs>
  `;

  state.edges.forEach((edge) => {
    const parent = state.nodes.find((n) => n.id === edge.parentId);
    const child = state.nodes.find((n) => n.id === edge.childId);
    if (!parent || !child) return;

    const startX = parent.x + NODE_WIDTH;
    const startY = parent.y + NODE_HEIGHT / 2;
    const endX = child.x;
    const endY = child.y + NODE_HEIGHT / 2;

    const dx = endX - startX;
    const c1x = startX + Math.max(45, dx * 0.35);
    const c2x = endX - Math.max(45, dx * 0.35);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'edge');
    path.setAttribute('d', `M ${startX} ${startY} C ${c1x} ${startY}, ${c2x} ${endY}, ${endX} ${endY}`);
    edgeLayer.appendChild(path);
  });
}

function renderInspector() {
  const node = getSelectedNode();
  if (!node) {
    inspector.classList.add('hidden');
    emptySelection.classList.remove('hidden');
    return;
  }

  inspector.classList.remove('hidden');
  emptySelection.classList.add('hidden');

  nodeNameInput.value = node.name;
  nodeTypeInput.value = node.type;
  stateInput.value = node.states.join(', ');
  evidenceSelect.innerHTML = `<option value="__none__">(none)</option>${node.states.map((s) => `<option>${s}</option>`).join('')}`;
  evidenceSelect.value = node.evidence || '__none__';
  renderCptEditor(node);
}

function renderCptEditor(node) {
  const combos = parentCombinations(getParents(node.id));
  if (!Object.keys(node.cpt).length) initializeCpt(node);
  cptContainer.innerHTML = '';

  combos.forEach((combo) => {
    const row = document.createElement('div');
    row.className = 'cpt-row';

    const label = document.createElement('span');
    label.textContent = combo.label || '(no parents)';

    const input = document.createElement('input');
    input.value = (node.cpt[combo.key] || uniform(node.states.length)).join(', ');
    input.title = 'Comma separated probabilities for states in order.';
    input.addEventListener('change', () => {
      const arr = input.value.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v) && v >= 0);
      if (arr.length !== node.states.length) {
        input.value = node.cpt[combo.key].join(', ');
        return;
      }
      const sum = arr.reduce((a, b) => a + b, 0) || 1;
      node.cpt[combo.key] = arr.map((v) => Number((v / sum).toFixed(4)));
      input.value = node.cpt[combo.key].join(', ');
    });

    row.appendChild(label);
    row.appendChild(input);
    cptContainer.appendChild(row);
  });
}

function applyStates() {
  const node = getSelectedNode();
  if (!node) return;
  const parsed = stateInput.value.split(',').map((s) => s.trim()).filter(Boolean);
  if (parsed.length < 2) return;
  node.states = parsed;
  node.evidence = null;
  initializeCpt(node);
  render();
}

function getSelectedNode() {
  return state.nodes.find((n) => n.id === state.selectedNodeId) || null;
}

function handleConnectClick(nodeId) {
  if (!state.pendingParentId) {
    state.pendingParentId = nodeId;
    return;
  }

  const parentId = state.pendingParentId;
  const childId = nodeId;
  state.pendingParentId = null;

  if (parentId === childId) return;
  if (state.edges.some((e) => e.parentId === parentId && e.childId === childId)) return;

  state.edges.push({ parentId, childId });
  if (createsCycle()) {
    state.edges.pop();
    return;
  }

  const child = state.nodes.find((n) => n.id === childId);
  if (child) initializeCpt(child);
  render();
}

function createsCycle() {
  const children = new Map(state.nodes.map((n) => [n.id, []]));
  state.edges.forEach((e) => children.get(e.parentId)?.push(e.childId));

  const visiting = new Set();
  const visited = new Set();

  function dfs(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const c of children.get(id) || []) {
      if (dfs(c)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  return state.nodes.some((n) => dfs(n.id));
}

function getParents(nodeId) {
  const ids = state.edges.filter((e) => e.childId === nodeId).map((e) => e.parentId);
  return ids.map((id) => state.nodes.find((n) => n.id === id)).filter(Boolean);
}

function parentCombinations(parents) {
  if (!parents.length) return [{ key: '__root__', values: [], label: '' }];
  const combos = [];

  function build(i, values, label) {
    if (i >= parents.length) {
      combos.push({ key: values.join('|'), values: [...values], label: label.join(', ') });
      return;
    }
    const p = parents[i];
    p.states.forEach((s) => {
      values.push(s);
      label.push(`${p.name}=${s}`);
      build(i + 1, values, label);
      values.pop();
      label.pop();
    });
  }

  build(0, [], []);
  return combos;
}

function runInference() {
  const ordered = topoOrder();
  if (!ordered) {
    inferenceOutput.innerHTML = 'Cannot infer: graph has a cycle.';
    summaryOutput.innerHTML = '';
    return;
  }

  const hypothesisNodes = state.nodes.filter((n) => n.type === 'hypothesis');
  if (!hypothesisNodes.length) {
    inferenceOutput.innerHTML = 'Add at least one Hypothesis node to run inference.';
    summaryOutput.innerHTML = '';
    return;
  }

  const rows = [];
  const summaryLines = [];

  hypothesisNodes.forEach((node) => {
    const probs = node.states.map((s) => enumeratePosterior(node, s, ordered));
    const z = probs.reduce((a, b) => a + b, 0) || 1;
    const normalized = probs.map((p) => p / z);

    const bestIndex = normalized.reduce((best, p, i, arr) => (p > arr[best] ? i : best), 0);
    const bestState = node.states[bestIndex];
    const bestProb = (normalized[bestIndex] * 100).toFixed(2);
    const segments = node.states.map((s, i) => `${s}: ${(normalized[i] * 100).toFixed(2)}%`).join(' | ');

    rows.push(`<div><strong>${node.name}</strong><br/>${segments}</div><hr/>`);

    const parents = getParents(node.id).filter((p) => p.type === 'evidence');
    const givenText = parents.length ? parents.map((p) => p.name).join(' and ') : 'available evidence';
    summaryLines.push(`The probability of ${node.name} being ${bestState} given ${givenText} is ${bestProb}%.`);
  });

  inferenceOutput.innerHTML = rows.join('');
  summaryOutput.innerHTML = summaryLines.map((s) => `<div>${s}</div>`).join('');
}

function enumeratePosterior(queryNode, queryState, ordered) {
  const evidence = {};
  state.nodes.forEach((n) => {
    if (n.evidence) evidence[n.id] = n.evidence;
  });
  evidence[queryNode.id] = queryState;
  return enumerateAll(ordered, evidence);
}

function enumerateAll(vars, evidence) {
  if (!vars.length) return 1;
  const [first, ...rest] = vars;

  if (evidence[first.id]) {
    return probGivenParents(first, evidence[first.id], evidence) * enumerateAll(rest, evidence);
  }

  return first.states.reduce((sum, st) => {
    const nextEvidence = { ...evidence, [first.id]: st };
    return sum + probGivenParents(first, st, nextEvidence) * enumerateAll(rest, nextEvidence);
  }, 0);
}

function probGivenParents(node, stateName, evidence) {
  const parents = getParents(node.id);
  const key = parents.length ? parents.map((p) => evidence[p.id] || p.states[0]).join('|') : '__root__';
  const dist = node.cpt[key] || uniform(node.states.length);
  const idx = node.states.indexOf(stateName);
  return dist[idx] ?? 0;
}

function topoOrder() {
  const indeg = new Map(state.nodes.map((n) => [n.id, 0]));
  const kids = new Map(state.nodes.map((n) => [n.id, []]));

  state.edges.forEach((e) => {
    indeg.set(e.childId, (indeg.get(e.childId) || 0) + 1);
    kids.get(e.parentId)?.push(e.childId);
  });

  const queue = state.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const out = [];

  while (queue.length) {
    const id = queue.shift();
    out.push(state.nodes.find((n) => n.id === id));
    (kids.get(id) || []).forEach((c) => {
      indeg.set(c, (indeg.get(c) || 0) - 1);
      if (indeg.get(c) === 0) queue.push(c);
    });
  }

  return out.length === state.nodes.length ? out : null;
}

function deleteSelectedNode() {
  if (!state.selectedNodeId) return;
  const id = state.selectedNodeId;
  state.nodes = state.nodes.filter((n) => n.id !== id);
  state.edges = state.edges.filter((e) => e.parentId !== id && e.childId !== id);
  state.selectedNodeId = null;
  render();
}

function updateConnectModeVisual() {
  const btn = document.getElementById('connectModeBtn');
  btn.textContent = state.connectMode ? '🔗 Connecting... (parent then child)' : '🔗 Connect Nodes';
}

function saveModelObject() {
  return { version: 2, nodes: state.nodes, edges: state.edges };
}

function loadModelObject(model) {
  if (!model || !Array.isArray(model.nodes) || !Array.isArray(model.edges)) return;
  state.nodes = model.nodes;
  state.edges = model.edges;
  state.selectedNodeId = null;
  state.connectMode = false;
  state.pendingParentId = null;
  render();
}

function saveToFile() {
  const blob = new Blob([JSON.stringify(saveModelObject(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bayesian-network-save-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function uploadState(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      loadModelObject(JSON.parse(String(reader.result)));
    } catch {
      alert('Could not parse JSON save file.');
    }
  };
  reader.readAsText(file);
}

function quickSave() {
  localStorage.setItem('bnStudioQuickSave', JSON.stringify(saveModelObject()));
}

function quickLoad() {
  const raw = localStorage.getItem('bnStudioQuickSave');
  if (!raw) return;
  try {
    loadModelObject(JSON.parse(raw));
  } catch {
    alert('Quick save was invalid.');
  }
}

setupEvents();
render();
