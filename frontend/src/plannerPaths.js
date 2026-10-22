// Read-only adapters over `plannerState` for the strategy layer of the evidence map.
//
// NOTHING here decides anything scientific. Every function only reads fields the backend
// already sends and normalises their shape for the UI:
//   - which nodes/edges are on the backend's current projected path
//   - which nodes the backend has classified as optional / redundant / passed
// If the backend does not send a field, the matching result is empty / "unavailable" and the UI
// shows nothing (or an honest "not provided" note). No path is ever inferred from graph
// structure, and no scenario is special-cased.

// ---------- Current projected path ----------
//
// Expected (not yet sent by the backend as of the reference api_server.py / experiment_selector.py):
//   plannerState.projected_path            or   plannerState.planner.projected_path
// Accepted shapes:
//   ['node_a', 'node_b', ...]                                   ordered node ids
//   [{ node_id | id, ...meta }, ...]                            ordered objects
//   { node_ids | path | nodes: [...ids or objects],             ordered nodes
//     edges?: [['a','b'] | { source, target }],                 explicit edges (optional)
//     summary? | reason? | rationale?: string }                 free text from the backend
export function getProjectedPath(plannerState) {
  const raw = plannerState?.projected_path ?? plannerState?.planner?.projected_path ?? null
  const empty = { available: false, orderedIds: [], nodeIds: new Set(), edgeKeys: new Set(), summary: null, metaById: {} }
  if (raw === null || raw === undefined) return empty

  const rawNodes = Array.isArray(raw) ? raw : (raw.node_ids ?? raw.path ?? raw.nodes ?? [])
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) return empty

  const orderedIds = []
  const metaById = {}
  rawNodes.forEach((entry) => {
    const id = typeof entry === 'string' ? entry : (entry?.node_id ?? entry?.id)
    if (typeof id !== 'string') return
    orderedIds.push(id)
    if (typeof entry === 'object') metaById[id] = entry
  })
  if (orderedIds.length === 0) return empty

  const edgeKeys = new Set()
  const explicitEdges = Array.isArray(raw) ? null : raw.edges
  if (Array.isArray(explicitEdges)) {
    explicitEdges.forEach((edge) => {
      const source = Array.isArray(edge) ? edge[0] : edge?.source
      const target = Array.isArray(edge) ? edge[1] : edge?.target
      if (typeof source === 'string' && typeof target === 'string') edgeKeys.add(`${source}>${target}`)
    })
  } else {
    // The backend supplied an ordered route: consecutive entries are its segments.
    for (let i = 0; i < orderedIds.length - 1; i += 1) edgeKeys.add(`${orderedIds[i]}>${orderedIds[i + 1]}`)
  }

  const summary = Array.isArray(raw) ? null : (raw.summary ?? raw.reason ?? raw.rationale ?? null)
  return { available: true, orderedIds, nodeIds: new Set(orderedIds), edgeKeys, summary: typeof summary === 'string' ? summary : null, metaById }
}

// ---------- Backend-confirmed irrelevant / redundant branches ----------
//
// Two backend signals are honoured:
//  1. explicit lists (future-proof): plannerState.irrelevant_node_ids | muted_node_ids |
//     passed_node_ids, also under plannerState.planner.
//  2. today's planner output: every ranked experiment on a node carries
//     impact_details.decision_path_role. Experiments the planner classes as
//     'optional_redundant' mark that node as optional/redundant for the current decision.
//     A node is only muted when it has ranked experiments and ALL of them are optional_redundant,
//     and the recommended node is never muted.
// Anything outside these signals is NOT muted: not being on the projected path just means
// "an alternative route", not "irrelevant".
export function getBackendMutedNodes(plannerState) {
  const muted = new Map() // nodeId -> short reason string from the backend's own vocabulary
  if (!plannerState) return muted

  ;[plannerState, plannerState.planner].forEach((holder) => {
    ;['irrelevant_node_ids', 'muted_node_ids', 'passed_node_ids'].forEach((key) => {
      if (Array.isArray(holder?.[key])) holder[key].forEach((id) => muted.set(id, key.replace('_node_ids', '')))
    })
  })

  const recommendedNodeId = plannerState.recommendation?.node_id
  const rolesByNode = {}
  ;(plannerState.ranked_experiments ?? []).forEach((entry) => {
    const nodeId = entry?.node?.id
    const role = entry?.impact_details?.decision_path_role
    if (!nodeId || !role) return
    ;(rolesByNode[nodeId] ??= []).push(role)
  })
  Object.entries(rolesByNode).forEach(([nodeId, roles]) => {
    if (nodeId !== recommendedNodeId && roles.every((role) => role === 'optional_redundant')) {
      if (!muted.has(nodeId)) muted.set(nodeId, 'optional_redundant')
    }
  })

  return muted
}

export const MUTED_REASON_LABELS = {
  optional_redundant: 'optional for the current decision',
  irrelevant: 'marked not relevant by the planner',
  muted: 'marked not relevant by the planner',
  passed: 'passed by the planner',
}

// ---------- What changed after a result ----------
//
// Both the result and the historical-reveal responses carry node_before_update /
// node_after_update (statuses and confidences exactly as the backend computed them).
export function getEvidenceChange(update) {
  const displayed = update?.transition ?? update
  const before = displayed?.node_before_update
  const after = displayed?.node_after_update
  if (!before || !after || !after.id) return null
  return {
    nodeId: after.id,
    fromStatus: before.status,
    toStatus: after.status,
    fromConfidence: before.confidence,
    toConfidence: after.confidence,
    statusChanged: before.status !== after.status,
  }
}
