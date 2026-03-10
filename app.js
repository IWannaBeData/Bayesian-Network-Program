const NODE_WIDTH = 154;
const NODE_HEIGHT = 58;

const state = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeIds: new Set(),
  highlightedNodeIds: new Set(),
  tool: 'select',
  pendingArrowSourceId: null,
  dragNode: null,
  dragEdge: null,
  dragEdgeHead: null,
  pan: { x: 0, y: 0 },
  zoom: 1,
  panningCanvas: null,
  nodeLight: 48,
};

const canvas = document.getElementById('canvas');
const canvasWrap = document.getElementById('canvasWrap');
const viewport = document.getElementById('viewport');
const edgeLayer = document.getElementById('edgeLayer');
const inspector = document.getElementById('inspector');
const emptySelection = document.getElementById('emptySelection');
const nodeInspector = document.getElementById('nodeInspector');
const edgeInspector = document.getElementById('edgeInspector');
const nodeNameInput = document.getElementById('nodeName');
const nodeTypeInput = document.getElementById('nodeType');
const nodeRoleInput = document.getElementById('nodeRole');
const evidenceSelect = document.getElementById('evidenceSelect');
const cptContainer = document.getElementById('cptContainer');
const statePills = document.getElementById('statePills');
const newStateInput = document.getElementById('newStateInput');
const probabilityStateSelect = document.getElementById('probabilityStateSelect');
const probabilityValue = document.getElementById('probabilityValue');
const inferenceOutput = document.getElementById('inferenceOutput');
const summaryOutput = document.getElementById('summaryOutput');

function setupEvents() {
  document.querySelectorAll('[data-add-node]').forEach((btn) => btn.addEventListener('click', () => addNode(btn.dataset.addNode)));
  document.getElementById('selectToolBtn').addEventListener('click', () => setTool('select'));
  document.getElementById('drawArrowToolBtn').addEventListener('click', () => setTool('drawArrow'));
  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelected);
  document.getElementById('highlightAllBtn').addEventListener('click', highlightAllNodes);
  document.getElementById('clearHighlightBtn').addEventListener('click', clearHighlights);

  nodeNameInput.addEventListener('input', () => {
    const node = getSelectedNode();
    if (!node) return;
    node.name = nodeNameInput.value;
    renderNodes();
    renderEdges();
    updatePlainSummaryForCurrentSelection();
  });

  evidenceSelect.addEventListener('change', () => {
    const node = getSelectedNode();
    if (!node) return;
    node.evidence = evidenceSelect.value === '__none__' ? null : evidenceSelect.value;
    runInference(false);
  });

  probabilityStateSelect.addEventListener('change', () => updateProbabilityReadout());

  newStateInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addStateFromInput();
    }
  });
  document.getElementById('addStateBtn').addEventListener('click', addStateFromInput);
  document.getElementById('runInferenceBtn').addEventListener('click', () => runInference(true));

  document.getElementById('nodeLightInput').addEventListener('input', (event) => {
    state.nodeLight = Number(event.target.value);
    renderNodes();
  });

  document.getElementById('saveFileBtn').addEventListener('click', saveToFile);
  document.getElementById('openFileBtn').addEventListener('click', () => document.getElementById('uploadInput').click());
  document.getElementById('uploadInput').addEventListener('change', (event) => importFromFile(event.target.files?.[0]));
  document.getElementById('quickSaveBtn').addEventListener('click', quickSave);
  document.getElementById('quickLoadBtn').addEventListener('click', quickLoad);

  setupDropZone();

  canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
  canvas.addEventListener('mousedown', onCanvasMouseDown);
  canvas.addEventListener('click', (event) => {
    if (event.target === canvas || event.target === viewport || event.target === edgeLayer) {
      setTool('select');
      clearSelection();
    }
  });

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', () => {
    state.dragNode = null;
    state.dragEdge = null;
    state.dragEdgeHead = null;
    state.panningCanvas = null;
    canvas.classList.remove('panning');
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
    const tag = event.target?.tagName?.toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || event.target?.isContentEditable;
    if (typing) return;
    event.preventDefault();
    deleteSelected();
  });
}

function defaultStatesByType(type) {
  return type === 'hypothesis' ? ['True', 'False'] : ['Present', 'Absent'];
}

function nextNodeNumber(type) {
  const prefix = type === 'evidence' ? 'Evidence ' : 'Hypothesis ';
  let maxNum = 0;
  state.nodes.forEach((n) => {
    if (n.type !== type) return;
    if (!n.name.startsWith(prefix)) return;
    const num = Number(n.name.slice(prefix.length));
    if (Number.isFinite(num)) maxNum = Math.max(maxNum, num);
  });
  return maxNum + 1;
}

function addNode(type) {
  const id = crypto.randomUUID();
  const states = defaultStatesByType(type);
  const node = {
    id,
    type,
    name: `${type === 'evidence' ? 'Evidence' : 'Hypothesis'} ${nextNodeNumber(type)}`,
    x: 100 + Math.random() * 300,
    y: 100 + Math.random() * 220,
    states,
    evidence: type === 'evidence' ? states[0] : null,
    cpt: {},
    heatProb: null,
    posterior: null,
  };
  state.nodes.push(node);
  initializeCpt(node);
  state.selectedNodeId = id;
  state.selectedEdgeIds.clear();
  state.highlightedNodeIds = new Set([id]);
  runInference(false);
  render();
}

function initializeCpt(node) {
  const parents = getParents(node.id);
  const combos = parentCombinations(parents);
  node.cpt = {};
  combos.forEach((combo) => {
    node.cpt[combo.key] = heuristicDistribution(node, parents, combo.values);
  });
}

function heuristicDistribution(node, parents, parentValues) {
  const n = node.states.length;
  if (n === 2) {
    let p = 0.5;
    for (let i = 0; i < parents.length; i += 1) {
      const parent = parents[i];
      const value = parentValues[i];
      if (value !== parent.states[0]) continue;
      if (node.type === 'evidence' && parent.type === 'evidence') p += 0.12;
      if (node.type === 'hypothesis' && parent.type === 'hypothesis') p += 0.12;
      if (node.type === 'hypothesis' && parent.type === 'evidence') p += 0.16;
      if (node.type === 'evidence' && parent.type === 'hypothesis') p += 0.08;
    }
    p = Math.max(0.03, Math.min(0.97, p));
    return [Number(p.toFixed(4)), Number((1 - p).toFixed(4))];
  }
  return uniform(n);
}

function uniform(len) {
  return Array.from({ length: len }, () => Number((1 / len).toFixed(4)));
}

function setTool(tool) {
  state.tool = tool;
  state.pendingArrowSourceId = null;
  document.getElementById('selectToolBtn').classList.toggle('active-tool', tool === 'select');
  document.getElementById('drawArrowToolBtn').classList.toggle('active-tool', tool === 'drawArrow');
  document.getElementById('drawHint').classList.toggle('hidden', tool !== 'drawArrow');
  renderNodes();
}

function render() {
  renderNodes();
  renderEdges();
  renderInspector();
}

function renderNodes() {
  viewport.querySelectorAll('.node').forEach((el) => el.remove());
  state.nodes.forEach((node) => {
    const el = document.createElement('div');
    el.className = `node ${node.type}`;
    if (node.id === state.selectedNodeId) el.classList.add('selected');
    if (state.highlightedNodeIds.has(node.id)) el.classList.add('highlighted');
    if (node.id === state.pendingArrowSourceId) el.classList.add('arrow-source');
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.style.background = nodeBackground(node);
    el.innerHTML = `<div class="title">${escapeHtml(node.name)}</div><div class="sub">${node.type} · ${computeRole(node)}</div>`;

    el.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      if (state.tool !== 'select') return;

      if (event.shiftKey) toggleHighlight(node.id);
      else if (!state.highlightedNodeIds.has(node.id)) state.highlightedNodeIds = new Set([node.id]);

      selectNode(node.id, false);
      const world = screenToWorld(event.clientX, event.clientY);
      const moveIds = state.highlightedNodeIds.size ? [...state.highlightedNodeIds] : [node.id];
      state.dragNode = {
        startWorld: world,
        starts: moveIds.map((id) => {
          const n = state.nodes.find((x) => x.id === id);
          return { id, x: n.x, y: n.y };
        }),
      };
      renderNodes();
    });

    el.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.tool === 'drawArrow') {
        handleArrowToolNodeClick(node.id);
        return;
      }
      if (event.shiftKey) toggleHighlight(node.id);
      else state.highlightedNodeIds = new Set([node.id]);
      selectNode(node.id, false);
      render();
      updatePlainSummaryForCurrentSelection();
    });

    viewport.appendChild(el);
  });
}

function nodeBackground(node) {
  if (node.states.length === 2 && Number.isFinite(node.heatProb)) {
    const hue = Math.round(120 * node.heatProb);
    const light = state.nodeLight;
    return `linear-gradient(140deg, hsl(${hue},85%,${Math.min(light + 12, 78)}%), hsl(${hue},78%,${light}%))`;
  }
  const hue = node.type === 'evidence' ? 170 : 250;
  const light = state.nodeLight;
  return `linear-gradient(140deg, hsl(${hue},80%,${Math.min(light + 14, 80)}%), hsl(${hue},74%,${light}%))`;
}

function renderEdges() {
  edgeLayer.innerHTML = `<defs><marker id="arrowHead" markerWidth="14" markerHeight="14" refX="13" refY="7" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,14 L13,7 z" fill="#5f91db" /></marker></defs>`;
  state.edges.forEach((edge) => {
    const parent = state.nodes.find((n) => n.id === edge.parentId);
    const child = state.nodes.find((n) => n.id === edge.childId);
    if (!parent || !child) return;

    const geometry = edgeGeometry(parent, child, edge);
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (state.selectedEdgeIds.has(edge.id)) group.setAttribute('class', 'edge-selected');

    const visible = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visible.setAttribute('class', 'edge-visible');
    visible.setAttribute('d', geometry.path);

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('class', 'edge-hit');
    hit.setAttribute('d', geometry.path);

    hit.addEventListener('click', (event) => {
      event.stopPropagation();
      if (event.shiftKey) {
        if (state.selectedEdgeIds.has(edge.id)) state.selectedEdgeIds.delete(edge.id);
        else state.selectedEdgeIds.add(edge.id);
      } else {
        state.selectedEdgeIds = new Set([edge.id]);
      }
      state.selectedNodeId = null;
      renderEdges();
      renderInspector();
      updatePlainSummaryForCurrentSelection();
    });

    hit.addEventListener('mousedown', (event) => {
      if (state.tool !== 'select') return;
      event.stopPropagation();
      if (!event.shiftKey) state.selectedEdgeIds = new Set([edge.id]);
      else if (!state.selectedEdgeIds.has(edge.id)) state.selectedEdgeIds.add(edge.id);
      state.selectedNodeId = null;
      state.dragEdge = { edgeIds: [...state.selectedEdgeIds], startY: event.clientY, starts: [...state.selectedEdgeIds].map((id) => ({ id, bend: (state.edges.find((e) => e.id === id)?.bend) || 0 })) };
      renderEdges();
      renderInspector();
    });

    group.appendChild(visible);
    group.appendChild(hit);
    edgeLayer.appendChild(group);

    if (state.selectedEdgeIds.has(edge.id)) {
      const headHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      headHandle.setAttribute('class', 'arrow-head-handle');
      headHandle.setAttribute('cx', geometry.end.x);
      headHandle.setAttribute('cy', geometry.end.y);
      headHandle.setAttribute('r', '6');
      headHandle.addEventListener('mousedown', (event) => {
        if (state.tool !== 'select') return;
        event.stopPropagation();
        state.dragEdgeHead = { edgeId: edge.id };
      });
      edgeLayer.appendChild(headHandle);
    }
  });
}

function edgeGeometry(parent, child, edge) {
  const start = anchorPoint(parent, child, true, null);
  const end = anchorPoint(child, parent, false, Number.isFinite(edge.endAnchorIndex) ? edge.endAnchorIndex : null);
  const bend = edge.bend || 0;
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const controlX = midX + nx * bend;
  const controlY = midY + ny * bend;
  return { path: `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`, start, end };
}

function anchorCandidates(node) {
  return [
    // Four corners
    { x: node.x, y: node.y },
    { x: node.x + NODE_WIDTH, y: node.y },
    { x: node.x, y: node.y + NODE_HEIGHT },
    { x: node.x + NODE_WIDTH, y: node.y + NODE_HEIGHT },
    // Center of each side
    { x: node.x + NODE_WIDTH / 2, y: node.y },
    { x: node.x + NODE_WIDTH / 2, y: node.y + NODE_HEIGHT },
    { x: node.x, y: node.y + NODE_HEIGHT / 2 },
    { x: node.x + NODE_WIDTH, y: node.y + NODE_HEIGHT / 2 },
  ];
}

function anchorPoint(fromNode, toNode, isSource, forcedIndex = null) {
  const candidates = anchorCandidates(fromNode);
  if (Number.isFinite(forcedIndex) && forcedIndex >= 0 && forcedIndex < candidates.length) {
    const c = candidates[forcedIndex];
    return { x: c.x, y: c.y, index: forcedIndex };
  }

  const centerFrom = { x: fromNode.x + NODE_WIDTH / 2, y: fromNode.y + NODE_HEIGHT / 2 };
  const centerTo = { x: toNode.x + NODE_WIDTH / 2, y: toNode.y + NODE_HEIGHT / 2 };
  const dx = centerTo.x - centerFrom.x;
  const dy = centerTo.y - centerFrom.y;

  let best = candidates[0];
  let bestIndex = 0;
  let bestScore = Infinity;
  candidates.forEach((p, idx) => {
    const vx = p.x - centerFrom.x;
    const vy = p.y - centerFrom.y;
    const outward = isSource ? (vx * dx + vy * dy) : (vx * -dx + vy * -dy);
    const distance = Math.hypot(p.x - centerTo.x, p.y - centerTo.y);
    const score = distance - outward * 0.2;
    if (score < bestScore) {
      bestScore = score;
      best = p;
      bestIndex = idx;
    }
  });

  return { x: best.x, y: best.y, index: bestIndex };
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.pan.x) / state.zoom,
    y: (clientY - rect.top - state.pan.y) / state.zoom,
  };
}

function onCanvasWheel(event) {
  event.preventDefault();
  const before = screenToWorld(event.clientX, event.clientY);
  const factor = event.deltaY < 0 ? 1.08 : 0.92;
  state.zoom = Math.max(0.35, Math.min(2.6, state.zoom * factor));
  const after = screenToWorld(event.clientX, event.clientY);
  state.pan.x += (after.x - before.x) * state.zoom;
  state.pan.y += (after.y - before.y) * state.zoom;
  applyViewportTransform();
}

function onCanvasMouseDown(event) {
  if (event.target !== canvas && event.target !== viewport && event.target !== edgeLayer) return;
  if (!event.ctrlKey) return;
  state.panningCanvas = { x: event.clientX, y: event.clientY, panX: state.pan.x, panY: state.pan.y };
  canvas.classList.add('panning');
}

function onMouseMove(event) {
  if (state.dragNode) {
    const world = screenToWorld(event.clientX, event.clientY);
    const dx = world.x - state.dragNode.startWorld.x;
    const dy = world.y - state.dragNode.startWorld.y;
    state.dragNode.starts.forEach((s) => {
      const node = state.nodes.find((x) => x.id === s.id);
      if (!node) return;
      node.x = s.x + dx;
      node.y = s.y + dy;
    });
    render();
    return;
  }

  if (state.dragEdgeHead) {
    const edge = state.edges.find((e) => e.id === state.dragEdgeHead.edgeId);
    if (!edge) return;
    const child = state.nodes.find((n) => n.id === edge.childId);
    if (!child) return;
    const world = screenToWorld(event.clientX, event.clientY);
    const candidates = anchorCandidates(child);
    let bestIdx = 0;
    let bestDist = Infinity;
    candidates.forEach((p, idx) => {
      const d = Math.hypot(world.x - p.x, world.y - p.y);
      if (d < bestDist) { bestDist = d; bestIdx = idx; }
    });
    edge.endAnchorIndex = bestIdx;
    renderEdges();
    return;
  }

  if (state.dragEdge) {
    const delta = (event.clientY - state.dragEdge.startY) / Math.max(0.6, state.zoom);
    state.dragEdge.starts.forEach((s) => {
      const edge = state.edges.find((e) => e.id === s.id);
      if (edge) edge.bend = Math.max(-240, Math.min(240, s.bend + delta));
    });
    renderEdges();
    return;
  }

  if (state.panningCanvas) {
    state.pan.x = state.panningCanvas.panX + (event.clientX - state.panningCanvas.x);
    state.pan.y = state.panningCanvas.panY + (event.clientY - state.panningCanvas.y);
    applyViewportTransform();
  }
}

function applyViewportTransform() {
  viewport.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
}


function toggleHighlight(nodeId) {
  if (state.highlightedNodeIds.has(nodeId)) state.highlightedNodeIds.delete(nodeId);
  else state.highlightedNodeIds.add(nodeId);
}

function highlightAllNodes() {
  state.highlightedNodeIds = new Set(state.nodes.map((n) => n.id));
  renderNodes();
  updatePlainSummaryForCurrentSelection();
}

function clearHighlights() {
  state.highlightedNodeIds.clear();
  renderNodes();
  updatePlainSummaryForCurrentSelection();
}

function handleArrowToolNodeClick(nodeId) {
  if (!state.pendingArrowSourceId) {
    state.pendingArrowSourceId = nodeId;
    renderNodes();
    return;
  }
  const parentId = state.pendingArrowSourceId;
  state.pendingArrowSourceId = null;
  if (parentId === nodeId) return renderNodes();
  if (state.edges.some((e) => e.parentId === parentId && e.childId === nodeId)) return renderNodes();

  const edge = { id: crypto.randomUUID(), parentId, childId: nodeId, bend: 0, endAnchorIndex: null };
  state.edges.push(edge);
  if (createsCycle()) {
    state.edges.pop();
    return renderNodes();
  }

  const child = state.nodes.find((n) => n.id === nodeId);
  if (child) initializeCpt(child);
  runInference(false);
  state.selectedEdgeIds = new Set([edge.id]);
  state.selectedNodeId = null;
  render();
  updatePlainSummaryForCurrentSelection();
}

function selectNode(id, rerender = true) {
  state.selectedNodeId = id;
  state.selectedEdgeIds.clear();
  if (rerender) render();
}

function clearSelection() {
  state.selectedNodeId = null;
  state.selectedEdgeIds.clear();
  renderInspector();
  render();
  updatePlainSummaryForCurrentSelection();
}

function getSelectedNode() {
  return state.nodes.find((n) => n.id === state.selectedNodeId) || null;
}

function computeRole(node) {
  const hasParents = state.edges.some((e) => e.childId === node.id);
  const hasChildren = state.edges.some((e) => e.parentId === node.id);
  if (hasParents && hasChildren) return 'evidence/hypothesis';
  return node.type;
}

function renderInspector() {
  const node = getSelectedNode();
  const edgeSelected = state.selectedEdgeIds.size > 0;
  if (!node && !edgeSelected) {
    inspector.classList.add('hidden');
    emptySelection.classList.remove('hidden');
    return;
  }

  inspector.classList.remove('hidden');
  emptySelection.classList.add('hidden');
  nodeInspector.classList.toggle('hidden', !node);
  edgeInspector.classList.toggle('hidden', !edgeSelected || !!node);

  if (node) {
    nodeNameInput.value = node.name;
    nodeTypeInput.value = node.type;
    nodeRoleInput.value = computeRole(node);
    evidenceSelect.innerHTML = `<option value="__none__">(none)</option>${node.states.map((s) => `<option>${escapeHtml(s)}</option>`).join('')}`;
    evidenceSelect.value = node.evidence || '__none__';

    probabilityStateSelect.innerHTML = node.states.map((s, i) => `<option value="${i}">${escapeHtml(s)}</option>`).join('');
    probabilityStateSelect.value = '0';
    updateProbabilityReadout();

    renderStatePills(node);
    renderCptEditor(node);
  }
}

function updateProbabilityReadout() {
  const node = getSelectedNode();
  if (!node || !node.posterior) {
    probabilityValue.textContent = '--';
    return;
  }
  const idx = Number(probabilityStateSelect.value || 0);
  const p = node.posterior[idx] ?? 0;
  probabilityValue.textContent = `${(p * 100).toFixed(2)}%`;
}

function renderStatePills(node) {
  statePills.innerHTML = '';
  node.states.forEach((label, index) => {
    const pill = document.createElement('div');
    pill.className = 'state-pill';
    pill.innerHTML = `<span>${escapeHtml(label)}</span>`;
    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.addEventListener('click', () => removeState(index));
    pill.appendChild(remove);
    statePills.appendChild(pill);
  });
}

function addStateFromInput() {
  const node = getSelectedNode();
  if (!node) return;
  const label = newStateInput.value.trim();
  if (!label || node.states.includes(label)) return;
  node.states.push(label);
  newStateInput.value = '';
  normalizeNodeAfterStateChange(node);
}

function removeState(index) {
  const node = getSelectedNode();
  if (!node || node.states.length <= 2) return;
  node.states.splice(index, 1);
  normalizeNodeAfterStateChange(node);
}

function normalizeNodeAfterStateChange(node) {
  if (node.evidence && !node.states.includes(node.evidence)) node.evidence = null;
  initializeCpt(node);
  runInference(false);
  render();
}

function renderCptEditor(node) {
  const combos = parentCombinations(getParents(node.id));
  cptContainer.innerHTML = '';
  combos.forEach((combo) => {
    const row = document.createElement('div');
    row.className = 'cpt-row';
    const label = document.createElement('span');
    label.textContent = combo.label || '(no parents)';
    const input = document.createElement('input');
    input.value = (node.cpt[combo.key] || uniform(node.states.length)).join(', ');
    input.addEventListener('change', () => {
      const arr = input.value.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v) && v >= 0);
      if (arr.length !== node.states.length) {
        input.value = (node.cpt[combo.key] || uniform(node.states.length)).join(', ');
        return;
      }
      const sum = arr.reduce((a, b) => a + b, 0) || 1;
      node.cpt[combo.key] = arr.map((v) => Number((v / sum).toFixed(4)));
      input.value = node.cpt[combo.key].join(', ');
      runInference(false);
      renderNodes();
      updateProbabilityReadout();
    });
    row.appendChild(label);
    row.appendChild(input);
    cptContainer.appendChild(row);
  });
}

function deleteSelected() {
  if (state.selectedNodeId) {
    const id = state.selectedNodeId;
    state.nodes = state.nodes.filter((n) => n.id !== id);
    state.edges = state.edges.filter((e) => e.parentId !== id && e.childId !== id);
    state.highlightedNodeIds.delete(id);
    state.selectedNodeId = null;
    runInference(false);
    render();
    updatePlainSummaryForCurrentSelection();
    return;
  }

  if (state.selectedEdgeIds.size) {
    const removed = new Set(state.selectedEdgeIds);
    const affectedChildren = [...removed]
      .map((id) => state.edges.find((e) => e.id === id)?.childId)
      .filter(Boolean);
    state.edges = state.edges.filter((e) => !removed.has(e.id));
    state.selectedEdgeIds.clear();
    affectedChildren.forEach((id) => {
      const child = state.nodes.find((n) => n.id === id);
      if (child) initializeCpt(child);
    });
    runInference(false);
    render();
    updatePlainSummaryForCurrentSelection();
  }
}

function getParents(nodeId) {
  return state.edges.filter((e) => e.childId === nodeId).map((e) => state.nodes.find((n) => n.id === e.parentId)).filter(Boolean);
}

function parentCombinations(parents) {
  if (!parents.length) return [{ key: '__root__', values: [], label: '' }];
  const combos = [];
  function build(idx, vals, labels) {
    if (idx >= parents.length) return combos.push({ key: vals.join('|'), values: [...vals], label: labels.join(', ') });
    parents[idx].states.forEach((s) => {
      vals.push(s); labels.push(`${parents[idx].name}=${s}`);
      build(idx + 1, vals, labels);
      vals.pop(); labels.pop();
    });
  }
  build(0, [], []);
  return combos;
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
    for (const c of children.get(id) || []) if (dfs(c)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return state.nodes.some((n) => dfs(n.id));
}

function effectiveEvidenceAssignments() {
  const out = {};
  state.nodes.forEach((n) => {
    if (n.evidence) out[n.id] = n.evidence;
    else if (n.type === 'evidence') out[n.id] = n.states[0];
  });
  return out;
}

function runInference(showOutputs) {
  const ordered = topoOrder();
  if (!ordered) {
    if (showOutputs) {
      inferenceOutput.innerHTML = 'Cannot infer: graph has a cycle.';
      summaryOutput.innerHTML = '';
    }
    return;
  }

  const hypotheses = state.nodes.filter((n) => n.type === 'hypothesis');
  state.nodes.forEach((n) => { n.heatProb = null; n.posterior = null; });

  state.nodes.filter((n) => n.states.length === 2).forEach((node) => {
    const p = enumeratePosterior(node, node.states[0], ordered);
    const q = enumeratePosterior(node, node.states[1], ordered);
    const z = p + q || 1;
    node.heatProb = p / z;
  });

  hypotheses.forEach((node) => {
    const probs = node.states.map((s) => enumeratePosterior(node, s, ordered));
    const z = probs.reduce((a, b) => a + b, 0) || 1;
    node.posterior = probs.map((v) => v / z);
  });

  const lines = hypotheses.map((n) => `<div><strong>${escapeHtml(n.name)}</strong><br/>${n.states.map((s, i) => `${escapeHtml(s)}: ${((n.posterior?.[i] || 0) * 100).toFixed(2)}%`).join(' | ')}</div><hr/>`);
  if (showOutputs) inferenceOutput.innerHTML = lines.join('') || 'No hypothesis nodes available.';

  updatePlainSummaryForCurrentSelection(showOutputs);
  renderNodes();
  updateProbabilityReadout();
}

function updatePlainSummaryForCurrentSelection(forceUpdateOutput = true) {
  const selectedNodeIds = new Set([...state.highlightedNodeIds]);
  if (state.selectedNodeId) selectedNodeIds.add(state.selectedNodeId);

  const selectedEdgeIds = new Set([...state.selectedEdgeIds]);
  const selectedEdges = state.edges.filter((e) => selectedEdgeIds.has(e.id));
  selectedEdges.forEach((e) => { selectedNodeIds.add(e.parentId); selectedNodeIds.add(e.childId); });

  let scopeNodes = state.nodes;
  if (selectedNodeIds.size || selectedEdgeIds.size) scopeNodes = state.nodes.filter((n) => selectedNodeIds.has(n.id));

  const scopedHypotheses = scopeNodes.filter((n) => n.type === 'hypothesis');
  const summary = scopedHypotheses.map((node) => {
    if (!node.posterior) return null;
    const best = node.posterior.reduce((bi, p, i, arr) => (p > arr[bi] ? i : bi), 0);
    const parents = getParents(node.id).filter((p) => p.type === 'evidence').map((p) => p.name);
    return `The probability of ${node.name} being ${node.states[best]} given ${parents.length ? parents.join(' and ') : 'available evidence'} is ${(node.posterior[best] * 100).toFixed(2)}%.`;
  }).filter(Boolean);

  if (forceUpdateOutput) {
    summaryOutput.innerHTML = summary.length ? summary.map((s) => `<div>${escapeHtml(s)}</div>`).join('') : '<div>Select nodes/arrows to show network summary.</div>';
  }
}

function enumeratePosterior(queryNode, queryState, ordered) {
  const evidence = effectiveEvidenceAssignments();
  evidence[queryNode.id] = queryState;
  return enumerateAll(ordered, evidence);
}

function enumerateAll(vars, evidence) {
  if (!vars.length) return 1;
  const [first, ...rest] = vars;
  if (evidence[first.id]) return probGivenParents(first, evidence[first.id], evidence) * enumerateAll(rest, evidence);
  return first.states.reduce((sum, st) => {
    const next = { ...evidence, [first.id]: st };
    return sum + probGivenParents(first, st, next) * enumerateAll(rest, next);
  }, 0);
}

function probGivenParents(node, stateName, evidence) {
  const parents = getParents(node.id);
  const key = parents.length ? parents.map((p) => evidence[p.id] || p.states[0]).join('|') : '__root__';
  const dist = node.cpt[key] || uniform(node.states.length);
  return dist[node.states.indexOf(stateName)] ?? 0;
}

function topoOrder() {
  const indeg = new Map(state.nodes.map((n) => [n.id, 0]));
  const kids = new Map(state.nodes.map((n) => [n.id, []]));
  state.edges.forEach((e) => { indeg.set(e.childId, indeg.get(e.childId) + 1); kids.get(e.parentId).push(e.childId); });
  const queue = state.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const out = [];
  while (queue.length) {
    const id = queue.shift();
    const node = state.nodes.find((n) => n.id === id);
    if (!node) continue;
    out.push(node);
    (kids.get(id) || []).forEach((c) => { indeg.set(c, indeg.get(c) - 1); if (indeg.get(c) === 0) queue.push(c); });
  }
  return out.length === state.nodes.length ? out : null;
}

function setupDropZone() {
  const dz = document.getElementById('dropZone');
  ['dragenter', 'dragover'].forEach((name) => dz.addEventListener(name, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((name) => dz.addEventListener(name, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
  dz.addEventListener('drop', (e) => importFromFile(e.dataTransfer?.files?.[0]));
}

function saveModelObject() {
  return {
    version: 7,
    nodes: state.nodes,
    edges: state.edges,
    pan: state.pan,
    zoom: state.zoom,
    gridOn: canvasWrap.classList.contains('grid-on'),
  };
}

function saveToFile() {
  const blob = new Blob([JSON.stringify(saveModelObject(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bayesian-network-save-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      loadModelObject(JSON.parse(String(reader.result)));
      document.getElementById('uploadInput').value = '';
    } catch {
      alert('Could not read save file. Please use a valid JSON save.');
    }
  };
  reader.readAsText(file);
}

function loadModelObject(model) {
  if (!model || !Array.isArray(model.nodes) || !Array.isArray(model.edges)) throw new Error('Invalid save format');

  state.nodes = model.nodes.map((n, i) => {
    const type = n.type === 'hypothesis' ? 'hypothesis' : 'evidence';
    const fallback = defaultStatesByType(type);
    const states = Array.isArray(n.states) && n.states.length > 1 ? n.states : fallback;
    return {
      id: n.id || crypto.randomUUID(),
      type,
      name: n.name || `Node ${i + 1}`,
      x: Number.isFinite(n.x) ? n.x : 90,
      y: Number.isFinite(n.y) ? n.y : 90,
      states,
      evidence: n.evidence || (type === 'evidence' ? states[0] : null),
      cpt: n.cpt && typeof n.cpt === 'object' ? n.cpt : {},
      heatProb: null,
      posterior: null,
    };
  });

  const ids = new Set(state.nodes.map((n) => n.id));
  state.edges = model.edges.map((e) => ({ id: e.id || crypto.randomUUID(), parentId: e.parentId, childId: e.childId, bend: Number.isFinite(e.bend) ? e.bend : 0, endAnchorIndex: Number.isFinite(e.endAnchorIndex) ? e.endAnchorIndex : null })).filter((e) => ids.has(e.parentId) && ids.has(e.childId));

  state.highlightedNodeIds.clear();
  state.selectedNodeId = null;
  state.selectedEdgeIds.clear();
  state.pendingArrowSourceId = null;
  state.pan = model.pan && Number.isFinite(model.pan.x) && Number.isFinite(model.pan.y) ? model.pan : { x: 0, y: 0 };
  state.zoom = Number.isFinite(model.zoom) ? Math.max(0.35, Math.min(2.6, model.zoom)) : 1;
  canvasWrap.classList.toggle('grid-on', model.gridOn !== false);
  applyViewportTransform();
  runInference(false);
  render();
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
    alert('Quick save data is invalid.');
  }
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

setupEvents();
setTool('select');
applyViewportTransform();
runInference(false);
render();
