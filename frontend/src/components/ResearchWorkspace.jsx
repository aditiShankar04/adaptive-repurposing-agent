import { useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import DecisionNode from './DecisionNode.jsx'
import NodeDetailPanel from './NodeDetailPanel.jsx'
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

function UpdatePanel({ lastUpdate, plannerState, onDismiss }) {
  if (!lastUpdate) return null

  const historicalEvidence = lastUpdate.historical_evidence
  const displayedUpdate = lastUpdate.transition ?? lastUpdate
  const newRecommendation = plannerState.ranked_experiments[0]

  return (
    <section className="update-panel" aria-label={historicalEvidence ? 'historical outcome' : 'last update'}>
      <button type="button" className="panel-close" onClick={onDismiss} aria-label="close this update (the planner state is kept)">
        <span aria-hidden="true">×</span>
      </button>
      <p className="panel-eyebrow">{historicalEvidence ? 'historical replay' : 'last update'}</p>
      <h3>{displayedUpdate.experiment.name}</h3>
      {historicalEvidence ? (
        <>
          <p>historical outcome: <strong>{historicalEvidence.historical_outcome}</strong></p>
          <p>evidence class: <strong>{historicalEvidence.evidence_class}</strong></p>
          <p>{historicalEvidence.summary}</p>
          <p>applied result: <strong>{historicalEvidence.applied_result}</strong> · qc: <strong>{historicalEvidence.qc}</strong></p>
          {historicalEvidence.historical_action ? <p><strong>historical action: {historicalEvidence.historical_action}</strong></p> : null}
          {historicalEvidence.scope ? <p>scope: <strong>{historicalEvidence.scope}</strong></p> : null}
        </>
      ) : (
        <p>result: <strong>{displayedUpdate.submitted_result.result}</strong> · qc: <strong>{displayedUpdate.submitted_result.qc}</strong></p>
      )}
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

function StrategyPanel({ projected, nodeById, selectedNodeId, onSelectNode, mutedCount }) {
  const shown = projected.orderedIds.filter((id) => nodeById[id])
  return (
    <section className="strategy-panel" aria-label="current projected path">
      <p className="panel-eyebrow">current strategy</p>
      {projected.available && shown.length ? <h3>current projected path</h3> : null}
      {projected.available && shown.length ? (
        <>
          <p className="strategy-basis">based on current evidence</p>
          <ol className="strategy-chain">
            {shown.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  className={`strategy-chip${selectedNodeId === id ? ' is-selected' : ''}`}
                  onClick={() => onSelectNode(id)}
                >
                  {nodeById[id].name}
                </button>
              </li>
            ))}
          </ol>
          {projected.summary ? <p className="strategy-summary">{projected.summary}</p> : null}
        </>
      ) : (
        <p className="strategy-empty">current projected path: not provided by the planner yet.</p>
      )}
      {mutedCount ? <p className="strategy-muted">{mutedCount} branch{mutedCount === 1 ? '' : 'es'} marked optional by the planner</p> : null}
    </section>
  )
}

function FinalDecisionPanel({ finalDecisionDetails, activeRestrictions }) {
  if (!finalDecisionDetails) return null

  return (
    <section className="final-decision-card" aria-label="final decision">
      <p className="panel-eyebrow">final decision</p>
      <h2>
        {finalDecisionDetails.node_name ?? finalDecisionDetails.node?.name ?? 'decision'}: {finalDecisionDetails.decision}
      </h2>
      {finalDecisionDetails.reason ? <p>{finalDecisionDetails.reason}</p> : null}
      {activeRestrictions.length ? (
        <div className="restriction-note">
          <strong>restrictions apply</strong>
          <span>regimen, population, or monitoring restrictions are active.</span>
          <ul>
            {activeRestrictions.map((node) => (
              <li key={node.id}>{node.name}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {finalDecisionDetails.dependencies?.length ? (
        <dl className="decision-dependencies">
          {finalDecisionDetails.dependencies.map((dependency) => (
            <div key={dependency.id}>
              <dt>{dependency.name}</dt>
              <dd>{dependency.status}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  )
}

function ResearchWorkspace({
  plannerState,
  explanation,
  explanationLoading,
  previewScenario,
  previewFileName,
  onChangeScenario,
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
  const finalDecisionDetails = isPreview
    ? null
    : plannerState.planner.final_decision_details
      ?? plannerState.planner.final_decisions?.find((finalDecision) => finalDecision.decision === 'GO')
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

  const updateVisible = !isPreview && Boolean(lastUpdate) && !updateDismissed
  useEffect(() => {
    if (!detailsOpen && !updateVisible) return undefined
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      if (detailsOpen) setSelectedNodeId(null)
      else setDismissedUpdate(lastUpdate)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detailsOpen, updateVisible, lastUpdate])

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
            <StrategyPanel
              projected={projected}
              nodeById={nodeById}
              selectedNodeId={selectedNodeId}
              onSelectNode={selectNode}
              mutedCount={mutedNodes.size}
            />
          )}

          <RecommendationPanel
            isPreview={isPreview}
            recommendation={topRankedExperiment}
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
            historicalReplay={scenario.type === 'historical_replay'}
            sessionTerminated={Boolean(plannerState?.planner?.terminated)}
          />

          {updateVisible && (
            <UpdatePanel lastUpdate={lastUpdate} plannerState={plannerState} onDismiss={() => setDismissedUpdate(lastUpdate)} />
          )}
          {!isPreview && lastUpdate && updateDismissed && (
            <button type="button" className="update-pill" onClick={() => setDismissedUpdate(null)}>view last update</button>
          )}
          {!isPreview && (
            <FinalDecisionPanel
              finalDecisionDetails={finalDecisionDetails}
              activeRestrictions={activeRestrictions}
            />
          )}
          {plannerState?.planner?.terminated ? (
            <p className="session-ended">
              <strong>session terminated:</strong> {plannerState.planner.final_decision}
            </p>
          ) : null}
        </section>

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
