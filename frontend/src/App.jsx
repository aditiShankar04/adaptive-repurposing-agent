import { useEffect, useState } from 'react'
import { ReactFlow, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './App.css'

const scenarioOptions = [
  { value: 'propranolol', label: 'Propranolol' },
  { value: 'xanomeline', label: 'Xanomeline' },
  { value: 'demo', label: 'Demo' },
]

const nodePositions = {
  mechanism: { x: 0, y: 0 },
  target_engagement: { x: 0, y: 160 },
  efficacy: { x: 0, y: 320 },
  exposure: { x: 280, y: 320 },
  clinical_signal: { x: 0, y: 0 },
  beta_mechanism: { x: -320, y: 160 },
  apoptosis_mechanism: { x: -160, y: 160 },
  vegf_mechanism: { x: 160, y: 160 },
  beta_independent: { x: 0, y: 160 },
  sox18: { x: 320, y: 320 },
  cellular_effect: { x: 0, y: 360 },
  in_vivo_effect: { x: 0, y: 540 },
  viability: { x: 0, y: 720 },
  safety: { x: -360, y: 540 },
}

function formatConfidence(confidence) {
  return `${Math.round(confidence * 100)}% confidence`
}

function formatDecimal(value) {
  return Number(value).toFixed(3)
}

function createGraphNodes(scientificNodes, recommendedNodeId) {
  return scientificNodes.map((node, index) => ({
    id: node.id,
    position: nodePositions[node.id] ?? { x: (index % 4) * 260, y: Math.floor(index / 4) * 170 },
    className: `decision-node status-${node.status}${node.id === recommendedNodeId ? ' recommended-node' : ''}`,
    data: {
      label: (
        <div>
          <div className="node-status">{node.status}</div>
          <div className="node-name">{node.name}</div>
          <div className="node-confidence">{formatConfidence(node.confidence)}</div>
        </div>
      ),
    },
  }))
}

function createGraphEdges(scientificNodes) {
  return scientificNodes.flatMap((node) =>
    node.downstream.map((downstreamNodeId) => ({
      id: `${node.id}-${downstreamNodeId}`,
      source: node.id,
      target: downstreamNodeId,
      type: 'smoothstep',
      animated: false,
    })),
  )
}

function App() {
  const [selectedScenario, setSelectedScenario] = useState('propranolol')
  const [sessionId, setSessionId] = useState(null)
  const [plannerState, setPlannerState] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedResult, setSelectedResult] = useState('positive')
  const [selectedQc, setSelectedQc] = useState('pass')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let ignore = false

    async function createSession() {
      setLoading(true)
      setError(null)
      setLastUpdate(null)
      setSessionId(null)

      try {
        const response = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenario: selectedScenario }),
        })

        if (!response.ok) {
          throw new Error(`Labyrinth API returned ${response.status}`)
        }

        const data = await response.json()

        if (!ignore) {
          setSessionId(data.session_id)
          setPlannerState(data.planner_state)
          setSelectedNodeId(data.planner_state.scenario.nodes[0]?.id ?? null)
        }
      } catch (fetchError) {
        if (!ignore) {
          setError(fetchError.message)
          setPlannerState(null)
          setSelectedNodeId(null)
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    createSession()

    return () => {
      ignore = true
    }
  }, [selectedScenario])

  if (loading) {
    return <main className="app-shell"><p className="muted">Loading Labyrinth state...</p></main>
  }

  if (error) {
    return <main className="app-shell"><p className="muted">Labyrinth API error: {error}</p></main>
  }

  if (!plannerState) {
    return <main className="app-shell"><p className="muted">No Labyrinth state available.</p></main>
  }

  const scenario = plannerState.scenario
  const topRankedExperiment = plannerState.ranked_experiments[0] ?? null 
  const recommendedNodeId = topRankedExperiment?.node_id ?? null
  const graphNodes = createGraphNodes(scenario.nodes, recommendedNodeId)
  const graphEdges = createGraphEdges(scenario.nodes)
  const selectedNode = scenario.nodes.find((node) => node.id === selectedNodeId) ?? scenario.nodes[0]
  const selectedExperiments = scenario.experiments.filter(
    (experiment) => experiment.tests_node === selectedNode?.id,
  )

  function handleNodeClick(_, flowNode) {
    setSelectedNodeId(flowNode.id)
  }

  async function handleSubmitResult(event) {
    event.preventDefault()

    if (!sessionId || !topRankedExperiment) {
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/sessions/${sessionId}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experiment_id: topRankedExperiment.experiment.id,
          result: selectedResult,
          qc: selectedQc,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? `Labyrinth API returned ${response.status}`)
      }

      setPlannerState(data.planner_state)
      setLastUpdate(data)
      setSelectedNodeId(data.node_after_update?.id ?? data.planner_state.scenario.nodes[0]?.id ?? null)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRevealHistoricalEvidence() {
    if (!sessionId || !topRankedExperiment) {
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/sessions/${sessionId}/reveal-historical-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? `Labyrinth API returned ${response.status}`)
      }

      const transition = data.transition
      setPlannerState(data.planner_state)
      setLastUpdate(data)
      setSelectedNodeId(transition.node_after_update?.id ?? data.planner_state.scenario.nodes[0]?.id ?? null)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const sessionTerminated = plannerState.planner.terminated
  const historicalReplay = scenario.type === 'historical_replay'
  const displayedUpdate = lastUpdate?.transition ?? lastUpdate
  const historicalEvidence = lastUpdate?.historical_evidence
  const newRecommendation = plannerState.ranked_experiments[0]
  const finalDecisionDetails = plannerState.planner.final_decision_details
    ?? plannerState.planner.final_decisions?.find((finalDecision) => finalDecision.decision === 'GO')
  const activeRestrictions = scenario.nodes.filter((node) => node.restriction_active)

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">LABYRINTH</p>
          <h1>Adaptive Experimental Navigation</h1>
          <p className="tagline">Navigate uncertainty. Choose the experiment that matters next.</p>
          <p className="scenario-title">{scenario.drug} -&gt; {scenario.disease}</p>
          <p>{scenario.goal}</p>
        </div>
        <div className="header-controls">
          <label>
            <span>Scenario</span>
            <select value={selectedScenario} onChange={(event) => setSelectedScenario(event.target.value)}>
              {scenarioOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="legend" aria-label="Node status legend">
            <span className="legend-item supported">Supported</span>
            <span className="legend-item uncertain">Uncertain</span>
            <span className="legend-item contradicted">Contradicted</span>
            <span className="legend-item unexplored">Unexplored</span>
          </div>
        </div>
      </header>

      <section className="graph-layout">
        <div className="flow-panel" aria-label="Decision dependency graph">
          <ReactFlow
            nodes={graphNodes}
            edges={graphEdges}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        <aside className="side-panel">
          <section className="recommendation-panel">
            <p className="eyebrow">Next Best Experiment</p>
            {finalDecisionDetails ? (
              <section className="final-decision-panel">
                <p className="eyebrow">Final Decision</p>
                <h2>{finalDecisionDetails.node_name}: {finalDecisionDetails.decision}</h2>
                {activeRestrictions.length ? (
                  <p><strong>Restrictions apply</strong> to regimen, population, or monitoring.</p>
                ) : null}
                <p>{finalDecisionDetails.reason}</p>
                {finalDecisionDetails.dependencies?.length ? (
                  <ul>
                    {finalDecisionDetails.dependencies.map((dependency) => (
                      <li key={dependency.id}>{dependency.name}: <strong>{dependency.status}</strong></li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {topRankedExperiment ? (
              <>
                <h2>{topRankedExperiment.experiment.name}</h2>
                <p className="question">
                  Tests <strong>{topRankedExperiment.node.name}</strong>, highlighted on the graph.
                </p>

                <dl className="score-grid">
                  <div>
                    <dt>Uncertainty</dt>
                    <dd>{formatDecimal(topRankedExperiment.metrics.uncertainty)}</dd>
                  </div>
                  <div>
                    <dt>Downstream Impact</dt>
                    <dd>{topRankedExperiment.metrics.downstream_impact}</dd>
                  </div>
                  <div>
                    <dt>Marginal Impact</dt>
                    <dd>{formatDecimal(topRankedExperiment.metrics.marginal_decision_impact)}</dd>
                  </div>
                  <div>
                    <dt>Discriminating Power</dt>
                    <dd>{formatDecimal(topRankedExperiment.metrics.discriminating_power)}</dd>
                  </div>
                  <div>
                    <dt>Cost</dt>
                    <dd>{topRankedExperiment.metrics.cost}</dd>
                  </div>
                  <div>
                    <dt>Time</dt>
                    <dd>{topRankedExperiment.metrics.time}</dd>
                  </div>
                  <div className="score-total">
                    <dt>Final Score</dt>
                    <dd>{formatDecimal(topRankedExperiment.metrics.score)}</dd>
                  </div>
                </dl>

                <p className="reason">
                  {topRankedExperiment.experiment.name} ranked highest because it tests {topRankedExperiment.node.name}
                  {' '}with uncertainty {formatDecimal(topRankedExperiment.metrics.uncertainty)} and marginal decision impact{' '}
                  {formatDecimal(topRankedExperiment.metrics.marginal_decision_impact)}, while having discriminating power{' '}
                  {formatDecimal(topRankedExperiment.metrics.discriminating_power)} at cost {topRankedExperiment.metrics.cost} and time{' '}
                  {topRankedExperiment.metrics.time}.
                </p>

                {historicalReplay ? (
                  <section className="result-form">
                    <h3>Historical Evidence Replay</h3>
                    <p className="muted">Historical evidence is revealed only after Labyrinth selects the next experiment.</p>
                    <button type="button" disabled={sessionTerminated || submitting} onClick={handleRevealHistoricalEvidence}>
                      {submitting ? 'Revealing...' : 'Reveal Historical Evidence'}
                    </button>
                  </section>
                ) : (
                  <form className="result-form" onSubmit={handleSubmitResult}>
                    <h3>Future Exploration</h3>
                    <p className="muted">Explore prospective outcomes by submitting a result.</p>
                    <label>
                      <span>Result</span>
                      <select
                        value={selectedResult}
                        onChange={(event) => setSelectedResult(event.target.value)}
                        disabled={sessionTerminated || submitting}
                      >
                        <option value="positive">Positive</option>
                        <option value="negative">Negative</option>
                        <option value="inconclusive">Inconclusive</option>
                      </select>
                    </label>
                    <label>
                      <span>QC</span>
                      <select
                        value={selectedQc}
                        onChange={(event) => setSelectedQc(event.target.value)}
                        disabled={sessionTerminated || submitting}
                      >
                        <option value="pass">Pass</option>
                        <option value="questionable">Questionable</option>
                        <option value="fail">Fail</option>
                      </select>
                    </label>
                    <button type="submit" disabled={sessionTerminated || submitting}>
                      {submitting ? 'Submitting...' : 'Submit Result'}
                    </button>
                  </form>
                )}
              </>
            ) : (
              !finalDecisionDetails ? (
                <p className="muted">{plannerState.planner.message ?? 'No useful experiment is currently available.'}</p>
              ) : null
            )}

            {displayedUpdate ? (
              <section className="update-panel">
                <p className="eyebrow">{historicalEvidence ? 'Historical Evidence Replay' : 'Last Update'}</p>
                <h3>{displayedUpdate.experiment.name}</h3>
                {historicalEvidence ? (
                  <>
                    <p>Historical outcome: <strong>{historicalEvidence.historical_outcome}</strong></p>
                    <p>Evidence class: <strong>{historicalEvidence.evidence_class}</strong></p>
                    <p>{historicalEvidence.summary}</p>
                    <p>Applied result: <strong>{historicalEvidence.applied_result}</strong> | QC: <strong>{historicalEvidence.qc}</strong></p>
                    {historicalEvidence.historical_action ? (
                      <p><strong>Historical action: {historicalEvidence.historical_action}</strong></p>
                    ) : null}
                    {historicalEvidence.scope ? (
                      <p>Scope: <strong>{historicalEvidence.scope}</strong></p>
                    ) : null}
                  </>
                ) : (
                  <p>Result: <strong>{displayedUpdate.submitted_result.result}</strong> | QC: <strong>{displayedUpdate.submitted_result.qc}</strong></p>
                )}
                <p>{displayedUpdate.update_details.reason}</p>
                <p>
                  Node: <strong>{displayedUpdate.node_before_update.status}</strong> ({formatConfidence(displayedUpdate.node_before_update.confidence)})
                  {' '}→ <strong>{displayedUpdate.node_after_update.status}</strong> ({formatConfidence(displayedUpdate.node_after_update.confidence)})
                </p>
                {displayedUpdate.update_details.recommended_action ? (
                  <p><strong>{displayedUpdate.update_details.recommended_action}</strong></p>
                ) : null}
                {displayedUpdate.update_details.action ? (
                  <p><strong>ACTION: {displayedUpdate.update_details.action}</strong></p>
                ) : null}
                {displayedUpdate.update_details.confirmed_failure ? (
                  <p><strong>CONFIRMED FAILURE: {displayedUpdate.update_details.confirmed_action}</strong></p>
                ) : null}
                {displayedUpdate.update_details.final_decision ? (
                  <p><strong>FINAL DECISION: {displayedUpdate.update_details.final_decision}</strong></p>
                ) : null}
                {newRecommendation ? (
                  <p>New recommendation: <strong>{newRecommendation.experiment.name}</strong></p>
                ) : null}
              </section>
            ) : null}

            {sessionTerminated ? (
              <p className="reason"><strong>Session terminated:</strong> {plannerState.planner.final_decision}</p>
            ) : null}
          </section>

          <section className="detail-panel">
            {selectedNode ? (
              <>
                <p className={`status-pill status-${selectedNode.status}`}>{selectedNode.status}</p>
                <h2>{selectedNode.name}</h2>
                <p className="question">{selectedNode.question}</p>

                <dl>
                  <div>
                    <dt>Confidence</dt>
                    <dd>{formatConfidence(selectedNode.confidence)}</dd>
                  </div>
                  <div>
                    <dt>Depends on</dt>
                    <dd>{selectedNode.depends_on.length ? selectedNode.depends_on.join(', ') : 'None'}</dd>
                  </div>
                  <div>
                    <dt>Downstream</dt>
                    <dd>{selectedNode.downstream.length ? selectedNode.downstream.join(', ') : 'None'}</dd>
                  </div>
                </dl>

                <h3>Candidate Experiments</h3>
                {selectedExperiments.length ? (
                  <ul className="experiment-list">
                    {selectedExperiments.map((experiment) => (
                      <li key={experiment.id}>
                        <strong>{experiment.name}</strong>
                        <span>Cost {experiment.cost} | Time {experiment.time} | Power {experiment.discriminating_power}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No experiment defined for this node yet.</p>
                )}
              </>
            ) : (
              <p>Select a node to inspect its decision state.</p>
            )}
          </section>
        </aside>
      </section>
    </main>
  )
}

export default App
