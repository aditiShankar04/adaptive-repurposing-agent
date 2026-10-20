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
  safety: { x: -280, y: 320 },
  exposure: { x: 280, y: 320 },
  clinical_signal: { x: 0, y: 0 },
  beta_mechanism: { x: -320, y: 160 },
  beta_independent: { x: 0, y: 160 },
  sox18: { x: 320, y: 320 },
  cellular_effect: { x: 0, y: 360 },
  in_vivo_effect: { x: 0, y: 540 },
  viability: { x: 0, y: 720 },
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
  const [plannerState, setPlannerState] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let ignore = false

    async function fetchPlannerState() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/planner?scenario=${selectedScenario}`)

        if (!response.ok) {
          throw new Error(`Planner API returned ${response.status}`)
        }

        const data = await response.json()

        if (!ignore) {
          setPlannerState(data)
          setSelectedNodeId(data.scenario.nodes[0]?.id ?? null)
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

    fetchPlannerState()

    return () => {
      ignore = true
    }
  }, [selectedScenario])

  if (loading) {
    return <main className="app-shell"><p className="muted">Loading planner state...</p></main>
  }

  if (error) {
    return <main className="app-shell"><p className="muted">Planner API error: {error}</p></main>
  }

  if (!plannerState) {
    return <main className="app-shell"><p className="muted">No planner state available.</p></main>
  }

  const scenario = plannerState.scenario
  const recommendation = plannerState.recommendation
  const topRankedExperiment = plannerState.ranked_experiments[0]
  const recommendedNodeId = recommendation?.node_id
  const graphNodes = createGraphNodes(scenario.nodes, recommendedNodeId)
  const graphEdges = createGraphEdges(scenario.nodes)
  const selectedNode = scenario.nodes.find((node) => node.id === selectedNodeId) ?? scenario.nodes[0]
  const selectedExperiments = scenario.experiments.filter(
    (experiment) => experiment.tests_node === selectedNode?.id,
  )

  function handleNodeClick(_, flowNode) {
    setSelectedNodeId(flowNode.id)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Adaptive repurposing prototype</p>
          <h1>{scenario.drug} -&gt; {scenario.disease}</h1>
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
              </>
            ) : (
              <p className="muted">{plannerState.planner.message ?? 'No useful experiment is currently available.'}</p>
            )}
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
