import { useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import DecisionNode from './DecisionNode.jsx'
import NodeDetailPanel from './NodeDetailPanel.jsx'
import ProgramOutlook from './ProgramOutlook.jsx'
import { outlookHeadline } from './outlook.js'
import RecommendationPanel from './RecommendationPanel.jsx'
import StatusLegend from './StatusLegend.jsx'
import Wordmark from './Wordmark.jsx'
import { createGraphEdges, createGraphNodes } from '../graph.js'
import { getBackendMutedNodes, getEvidenceChange, getProjectedPath } from '../plannerPaths.js'
import useInert from '../hooks/useInert.js'
import useReducedMotion from '../hooks/useReducedMotion.js'

const nodeTypes = { decision: DecisionNode }
const DOCK_TRANSITION_MS = 460
const FIT_OPTIONS = { padding: 0.18 }

function formatConfidence(confidence) {
  return `${Math.round(confidence * 100)}%`
}

function UpdatePanel({ lastUpdate, plannerState, historicalReplay, onDismiss }) {
  if (!lastUpdate) return null

  const historicalEvidence = lastUpdate.historical_evidence
  const displayedUpdate = lastUpdate.transition ?? lastUpdate
  const newRecommendation = plannerState.ranked_experiments[0]
  const closeButton = (
    <button type="button" className="panel-close" onClick={onDismiss} aria-label="close this update (the planner state is kept)">
      <span aria-hidden="true">×</span>
    </button>
  )

  // A revealed historical result shows only what was observed.
  if (historicalEvidence) {
    return (
      <section className="update-panel" aria-label="historical result">
        {closeButton}
        <h3 className="update-title">{displayedUpdate.experiment.name}</h3>
        <p>historical outcome: <strong>{String(historicalEvidence.historical_outcome).replaceAll('_', ' ')}</strong></p>
        {historicalEvidence.summary ? <p>{historicalEvidence.summary}</p> : null}
      </section>
    )
  }

  // Only manual results inside a historical scenario get a card (explored, not history);
  // prospective scenarios show no update card.
  if (!historicalReplay) return null

  return (
    <section className="update-panel" aria-label="explored outcome">
      {closeButton}
      <p className="panel-eyebrow">explored outcome</p>
      <p className="update-note">this result was supplied by the user to explore how labyrinth would adapt.</p>
      <h3>{displayedUpdate.experiment.name}</h3>
      <p>result: <strong>{displayedUpdate.submitted_result.result}</strong> · qc: <strong>{displayedUpdate.submitted_result.qc}</strong></p>
      <p>{displayedUpdate.update_details.reason}</p>
      <p>
        node: <strong>{displayedUpdate.node_before_update.status}</strong> ({formatConfidence(displayedUpdate.node_before_update.confidence)}){' '}
        → <strong>{displayedUpdate.node_after_update.status}</strong> ({formatConfidence(displayedUpdate.node_after_update.confidence)})
      </p>
      {displayedUpdate.update_details.recommended_action ? <p><strong>{displayedUpdate.update_details.recommended_action}</strong></p> : null}
      {displayedUpdate.update_details.action ? <p><strong>action: {displayedUpdate.update_details.action}</strong></p> : null}
      {displayedUpdate.update_details.confirmed_failure ? <p><strong>confirmed failure: {displayedUpdate.update_details.confirmed_action}</strong></p> : null}
      {displayedUpdate.update_details.final_decision ? <p><strong>final decision: {displayedUpdate.update_details.final_decision}</strong></p> : null}
      {newRecommendation ? <p>new quest: <strong>{newRecommendation.experiment.name}</strong></p> : null}
    </section>
  )
}

function EndExplorationDialog({ outlook, onCancel, onConfirm }) {
  const terminal = outlook && ['final_decision_reached', 'no_go'].includes(outlook.state)
  return (
    <div className="end-dialog-backdrop">
      <section className="end-dialog" role="dialog" aria-modal="true" aria-labelledby="end-dialog-title">
        <p className="panel-eyebrow" id="end-dialog-title">end exploration?</p>
        {outlook ? <h3>{outlookHeadline(outlook)}</h3> : null}
        <p>
          {terminal
            ? 'leaving returns you to scenario selection.'
            : 'no final decision has been reached. ending now records neither GO nor NO-GO and leaves the evidence as it is.'}
        </p>
        <div className="end-dialog-actions">
          <button type="button" className="text-button" onClick={onCancel} autoFocus>keep exploring</button>
          <button type="button" className="run-button" onClick={onConfirm}>end and return to scenarios</button>
        </div>
      </section>
    </div>
  )
}

function ResearchWorkspace({
  plannerState,
  explanation,
  explanationLoading,
  previewScenario,
  previewFileName,
  onChangeScenario,
  onEndExploration,
  onSubmitResult,
  onRevealHistoricalEvidence,
  selectedResult,
  selectedQc,
  onResultChange,
  onQcChange,
  submitting,
  lastUpdate,
}) {
  const reduced = useReducedMotion()
  const isPreview = Boolean(previewScenario)
  const scenario = isPreview ? previewScenario : plannerState.scenario
  const topRankedExperiment = isPreview ? null : plannerState.ranked_experiments[0] ?? null
  const recommendedNodeId = topRankedExperiment?.node?.id ?? plannerState?.recommendation?.node_id ?? null

  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [lastShownId, setLastShownId] = useState(null)
  const detailsOpen = selectedNodeId !== null
  const flowRef = useRef(null)
  const dockRef = useRef(null)
  const isFirstRender = useRef(true)

  const nodeById = useMemo(
    () => Object.fromEntries((scenario.nodes ?? []).map((node) => [node.id, node])),
    [scenario],
  )
  const weakNodeIds = useMemo(
    () => new Set((scenario.nodes ?? []).filter((node) => node.status === 'contradicted').map((node) => node.id)),
    [scenario],
  )
  // Read-only views of what the backend reports. Nothing here is computed or inferred.
  const projected = useMemo(() => getProjectedPath(isPreview ? null : plannerState), [isPreview, plannerState])
  const mutedNodes = useMemo(() => getBackendMutedNodes(isPreview ? null : plannerState), [isPreview, plannerState])

  // Brief emphasis on the node the last result changed.
  const [change, setChange] = useState(null)
  useEffect(() => {
    const next = lastUpdate ? getEvidenceChange(lastUpdate) : null
    if (!next || !next.nodeId) {
      setChange(null)
      return undefined
    }
    setChange({ ...next, key: `${next.nodeId}-${Date.now()}` })
    const timer = setTimeout(() => setChange(null), reduced ? 4000 : 3600)
    return () => clearTimeout(timer)
  }, [lastUpdate, reduced])

  // Close control for the outcome / update card: frontend presentation only.
  const [dismissedUpdate, setDismissedUpdate] = useState(null)
  const updateDismissed = Boolean(lastUpdate) && dismissedUpdate === lastUpdate

  const graphNodes = useMemo(
    () => createGraphNodes(scenario.nodes ?? [], recommendedNodeId, selectedNodeId, {
      weakNodeIds, projectedNodeIds: projected.nodeIds, mutedNodes, change,
    }),
    [scenario, recommendedNodeId, selectedNodeId, weakNodeIds, projected, mutedNodes, change],
  )
  const graphEdges = useMemo(
    () => createGraphEdges(scenario.nodes ?? [], recommendedNodeId, selectedNodeId, {
      weakNodeIds, projectedEdgeKeys: projected.edgeKeys, mutedNodes, change,
    }),
    [scenario, recommendedNodeId, selectedNodeId, weakNodeIds, projected, mutedNodes, change],
  )
  const shownNode = nodeById[selectedNodeId ?? lastShownId]
  const shownExperiments = shownNode
    ? (scenario.experiments ?? []).filter((experiment) => experiment.tests_node === shownNode.id)
    : []
  const unlockedNodes = topRankedExperiment
    ? (topRankedExperiment.node.downstream ?? []).map((id) => nodeById[id]).filter(Boolean)
    : []
  const roundNumber = (plannerState?.planner?.completed_experiment_ids?.length ?? 0) + 1
  const outlook = isPreview ? null : plannerState.planner.decision_outlook ?? null
  const historicalReplay = scenario.type === 'historical_replay'
  const [endDialogOpen, setEndDialogOpen] = useState(false)
  // Presentation only: minimized panels stay minimized across replans.
  const [outlookMinimized, setOutlookMinimized] = useState(false)
  const [questMinimized, setQuestMinimized] = useState(false)
  const activeRestrictions = isPreview
    ? []
    : (scenario.nodes ?? []).filter((node) => node.restriction_active)

  function selectNode(nodeId) {
    setSelectedNodeId(nodeId)
    setLastShownId(nodeId)
  }

  function closeDetails() {
    setSelectedNodeId(null)
  }

  const hasUpdateCard = !isPreview && Boolean(lastUpdate) && historicalReplay
  const updateVisible = hasUpdateCard && !updateDismissed
  useEffect(() => {
    if (!detailsOpen && !updateVisible && !endDialogOpen) return undefined
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      if (endDialogOpen) setEndDialogOpen(false)
      else if (detailsOpen) setSelectedNodeId(null)
      else setDismissedUpdate(lastUpdate)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detailsOpen, updateVisible, endDialogOpen, lastUpdate])

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return undefined
    }
    const timer = setTimeout(
      () => flowRef.current?.fitView({ ...FIT_OPTIONS, duration: reduced ? 0 : 350 }),
      reduced ? 0 : DOCK_TRANSITION_MS,
    )
    return () => clearTimeout(timer)
  }, [detailsOpen, reduced])

  useInert(dockRef, !detailsOpen)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <button type="button" className="text-button" onClick={onChangeScenario}>change scenario</button>
          {!isPreview && (
            <button type="button" className="text-button" onClick={() => setEndDialogOpen(true)}>end exploration</button>
          )}
        </div>

        <div className="header-brand">
          <Wordmark size="sm" />
        </div>

        <div className="context">
          <h1 className="context-title">
            {scenario.drug}
            <span className="context-arrow" aria-label="for">→</span>
            {scenario.disease}
          </h1>
          <p className="context-goal" title={scenario.goal}>{scenario.goal}</p>
          {isPreview && <p className="mode-badge">uploaded scenario preview{previewFileName ? ` · ${previewFileName}` : ''}</p>}
        </div>
      </header>

      <main className="workspace">
        <section className="graph-panel" aria-label="evidence map">
          <ReactFlow
            nodes={graphNodes}
            edges={graphEdges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, flowNode) => selectNode(flowNode.id)}
            onInit={(instance) => { flowRef.current = instance }}
            nodesDraggable={false}
            nodesConnectable={false}
            colorMode="dark"
            minZoom={0.3}
            fitView
            fitViewOptions={FIT_OPTIONS}
            proOptions={{ hideAttribution: true }}
          >
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>

          <p className="graph-caption">
            <span>evidence map</span>
            <span className="mono">research round {String(roundNumber).padStart(2, '0')}</span>
          </p>
          <div className="graph-legend"><StatusLegend showProjected={projected.available} showMuted={mutedNodes.size > 0} /></div>

          {!isPreview && (
            <div className="left-stack">
              <ProgramOutlook
                outlook={outlook}
                plannerMessage={plannerState?.planner?.message}
                activeRestrictions={activeRestrictions}
                minimized={outlookMinimized}
                onToggleMinimized={() => setOutlookMinimized((value) => !value)}
              />
            </div>
          )}

          <RecommendationPanel
            isPreview={isPreview}
            recommendation={topRankedExperiment}
            rankedCount={isPreview ? 0 : plannerState.ranked_experiments.length}
            minimized={questMinimized}
            onToggleMinimized={() => setQuestMinimized((value) => !value)}
            plannerMessage={plannerState?.planner?.message}
            explanation={explanation}
            explanationLoading={explanationLoading}
            unlockedNodes={unlockedNodes}
            onSelectNode={selectNode}
            selectedResult={selectedResult}
            selectedQc={selectedQc}
            onResultChange={onResultChange}
            onQcChange={onQcChange}
            onSubmitResult={onSubmitResult}
            onRevealHistoricalEvidence={onRevealHistoricalEvidence}
            submitting={submitting}
            disabled={!topRankedExperiment}
            historicalReplay={historicalReplay}
            sessionTerminated={Boolean(plannerState?.planner?.terminated)}
          />

          {updateVisible && (
            <UpdatePanel
              lastUpdate={lastUpdate}
              plannerState={plannerState}
              historicalReplay={historicalReplay}
              onDismiss={() => setDismissedUpdate(lastUpdate)}
            />
          )}
          {hasUpdateCard && updateDismissed && (
            <button type="button" className="update-pill" onClick={() => setDismissedUpdate(null)}>view last result</button>
          )}
        </section>
        {endDialogOpen && (
          <EndExplorationDialog
            outlook={outlook}
            onCancel={() => setEndDialogOpen(false)}
            onConfirm={() => { setEndDialogOpen(false); onEndExploration() }}
          />
        )}

        <aside ref={dockRef} className={`details-dock${detailsOpen ? ' is-open' : ''}`} aria-label="node details" aria-hidden={!detailsOpen}>
          <div className="details-dock-inner">
            <NodeDetailPanel
              node={shownNode}
              nodeById={nodeById}
              experiments={shownExperiments}
              recommendedExperimentId={topRankedExperiment?.experiment.id}
              onSelectNode={selectNode}
              onClose={closeDetails}
            />
          </div>
        </aside>
      </main>
    </div>
  )
}

export default ResearchWorkspace
