import { MarkerType } from '@xyflow/react'

export const NODE_WIDTH = 176
const X_GAP = 262
const Y_GAP = 156
const EDGE_QUIET = '#6b6a85'
const EDGE_RISK = '#c25a4e'
const EDGE_TRAIL = '#3b4fc4'
const EDGE_LIT = '#3b4fc4'
const EDGE_PROJECTED = '#6a4bc9'
const TONE_HEX = { supported: '#4d8a5a', uncertain: '#b9822a', contradicted: '#c25a4e', unexplored: '#77759a' }

export function buildLinks(scientificNodes) {
  const ids = new Set(scientificNodes.map((node) => node.id))
  const seen = new Set()
  const links = []

  function add(source, target) {
    const key = `${source}\u0000${target}`
    if (source === target || !ids.has(source) || !ids.has(target) || seen.has(key)) return
    seen.add(key)
    links.push([source, target])
  }

  scientificNodes.forEach((node) => {
    ;(node.downstream ?? []).forEach((target) => add(node.id, target))
    ;(node.depends_on ?? []).forEach((source) => add(source, node.id))
  })

  return links
}

function computeLayers(scientificNodes, links) {
  const parents = Object.fromEntries(scientificNodes.map((node) => [node.id, []]))
  const children = Object.fromEntries(scientificNodes.map((node) => [node.id, []]))
  links.forEach(([source, target]) => {
    parents[target]?.push(source)
    children[source]?.push(target)
  })

  const memo = {}
  const visiting = new Set()

  function layerOf(nodeId) {
    if (nodeId in memo) return memo[nodeId]
    if (visiting.has(nodeId)) return 0
    visiting.add(nodeId)
    const layer = parents[nodeId]?.length ? 1 + Math.max(...parents[nodeId].map(layerOf)) : 0
    visiting.delete(nodeId)
    memo[nodeId] = layer
    return layer
  }

  scientificNodes.forEach((node) => layerOf(node.id))
  return { layers: memo, parents, children }
}

function unitHash(text, salt) {
  let h = 2166136261 ^ salt
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

function computeLayout(scientificNodes, links) {
  const { layers, parents, children } = computeLayers(scientificNodes, links)
  const maxLayer = Math.max(0, ...Object.values(layers))
  const columns = Array.from({ length: maxLayer + 1 }, (_, layer) =>
    scientificNodes.filter((node) => layers[node.id] === layer).map((node) => node.id))

  const order = {}
  const reindex = () => columns.forEach((ids) => ids.forEach((id, i) => { order[id] = i }))
  reindex()
  const meanOrder = (neighbours, fallback) => neighbours.length
    ? neighbours.reduce((sum, id) => sum + order[id], 0) / neighbours.length
    : fallback

  for (let pass = 0; pass < 2; pass += 1) {
    for (let layer = 1; layer <= maxLayer; layer += 1) {
      columns[layer].sort((a, b) => meanOrder(parents[a], order[a]) - meanOrder(parents[b], order[b]) || order[a] - order[b])
      reindex()
    }
    for (let layer = maxLayer - 1; layer >= 0; layer -= 1) {
      columns[layer].sort((a, b) => meanOrder(children[a], order[a]) - meanOrder(children[b], order[b]) || order[a] - order[b])
      reindex()
    }
  }

  const positions = {}
  columns.forEach((ids, layer) => {
    const slots = ids.map((id, i) => (i - (ids.length - 1) / 2) * Y_GAP)
    const targets = ids.map((id, i) => {
      const placed = parents[id].filter((parentId) => positions[parentId])
      if (!placed.length) return slots[i]
      const parentY = placed.reduce((sum, parentId) => sum + positions[parentId].y, 0) / placed.length
      return slots[i] * 0.55 + parentY * 0.45
    })
    const sorted = ids.map((id, i) => ({ id, y: targets[i] })).sort((a, b) => a.y - b.y)
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].y - sorted[i - 1].y < Y_GAP * 0.92) sorted[i].y = sorted[i - 1].y + Y_GAP * 0.92
    }
    const mean = sorted.reduce((sum, entry) => sum + entry.y, 0) / sorted.length
    const shift = (ids.length > 1 ? 0 : mean) - mean
    sorted.forEach((entry) => {
      positions[entry.id] = {
        x: layer * X_GAP + (unitHash(entry.id, 2) - 0.5) * 34,
        y: entry.y + shift + (unitHash(entry.id, 1) - 0.5) * 26,
      }
    })
    if (ids.length > 1) {
      const centre = ids.reduce((sum, id) => sum + positions[id].y, 0) / ids.length
      ids.forEach((id) => { positions[id].y -= centre })
    }
  })
  return { positions, layers }
}

// `roles` carries the strategic layer, all of it read from the backend (see plannerPaths.js):
//   weakNodeIds       contradicted nodes (evidence status, shown as a red cue)
//   projectedNodeIds  nodes on the backend's current projected path (empty if not provided)
//   mutedNodes        Map(nodeId -> reason) the backend classed as optional / redundant / passed
//   change            { nodeId, fromStatus, toStatus, key } for the node that just resolved
// Evidence status (supported / uncertain / ...) and strategic role are kept as separate data.
export function createGraphNodes(scientificNodes, recommendedNodeId, selectedNodeId, roles = {}) {
  const { weakNodeIds = new Set(), projectedNodeIds = new Set(), mutedNodes = new Map(), change = null } = roles
  const links = buildLinks(scientificNodes)
  const { positions, layers } = computeLayout(scientificNodes, links)
  return scientificNodes.map((node) => ({
    id: node.id,
    type: 'decision',
    position: node.position ?? positions[node.id],
    selected: node.id === selectedNodeId,
    data: {
      node,
      isRecommended: node.id === recommendedNodeId,
      isWeak: weakNodeIds.has(node.id) && node.id !== recommendedNodeId,
      isProjected: projectedNodeIds.has(node.id),
      mutedReason: mutedNodes.get(node.id) ?? null,
      change: change && change.nodeId === node.id ? change : null,
      layer: layers[node.id] ?? 0,
    },
  }))
}

function reachableFrom(startId, links) {
  const seen = new Set()
  const stack = [startId]
  while (stack.length) {
    const current = stack.pop()
    links.forEach(([source, target]) => {
      if (source === current && !seen.has(target)) {
        seen.add(target)
        stack.push(target)
      }
    })
  }
  return seen
}

// Edge emphasis. `kind` is the base look; `edge-projected` / `edge-muted` are strategic
// overlays driven only by backend data:
//   lit       touches the recommended node
//   risk      touches a contradicted node
//   trail     lies downstream of the recommended node
//   projected on the backend's projected path (overlay, combines with the base kind)
//   muted     touches a backend-muted node and is not on the projected path
export function createGraphEdges(scientificNodes, recommendedNodeId, selectedNodeId, roles = {}) {
  const { weakNodeIds = new Set(), projectedEdgeKeys = new Set(), mutedNodes = new Map(), change = null } = roles
  const nodeById = Object.fromEntries(scientificNodes.map((node) => [node.id, node]))
  const links = buildLinks(scientificNodes)
  const hasRecommendation = recommendedNodeId !== undefined && recommendedNodeId !== null
  const downstreamOfRecommended = hasRecommendation ? reachableFrom(recommendedNodeId, links) : new Set()

  return links.map(([source, target]) => {
    const projected = projectedEdgeKeys.has(`${source}>${target}`)
    const muted = !projected && (mutedNodes.has(source) || mutedNodes.has(target))

    let kind = 'quiet'
    if (hasRecommendation && (source === recommendedNodeId || target === recommendedNodeId)) kind = 'lit'
    else if (weakNodeIds.has(source) || weakNodeIds.has(target)) kind = 'risk'
    else if (downstreamOfRecommended.has(target) && (source === recommendedNodeId || downstreamOfRecommended.has(source))) kind = 'trail'
    else if (selectedNodeId && (source === selectedNodeId || target === selectedNodeId)) kind = 'selected'

    const sourceNode = nodeById[source]
    const tone = TONE_HEX[sourceNode?.status] ?? EDGE_QUIET
    const color = projected ? EDGE_PROJECTED : kind === 'lit' ? EDGE_LIT : kind === 'risk' ? EDGE_RISK : kind === 'trail' ? EDGE_TRAIL : tone
    // After a result, edges around the node that just resolved redraw.
    const adapting = change && (source === change.nodeId || target === change.nodeId)

    return {
      id: `${source}-${target}`,
      source,
      target,
      type: 'default',
      animated: false,
      className: [
        `edge-${kind}`,
        `tone-${sourceNode?.status ?? 'unexplored'}`,
        sourceNode?.status === 'unexplored' ? 'edge-dashed' : '',
        projected ? 'edge-projected' : '',
        muted ? 'edge-muted' : '',
        adapting || (projected && change) ? 'edge-adapt' : '',
      ].filter(Boolean).join(' '),
      style: { '--ew': (1.2 + (sourceNode?.confidence ?? 0.5) * 1.4).toFixed(2) },
      markerEnd: { type: MarkerType.Arrow, width: 11, height: 11, strokeWidth: 1.4, color: muted ? '#a9a7bb' : color },
    }
  })
}
