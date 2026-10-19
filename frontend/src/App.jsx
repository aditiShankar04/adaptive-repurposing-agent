import { useState } from 'react'
import { ReactFlow, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import scenario from '../../data/propranolol-scenario.json'
import './App.css'

const nodePositions = {
  mechanism: { x: 0, y: 0 },
  target_engagement: { x: 0, y: 160 },
  efficacy: { x: 0, y: 320 },
  safety: { x: -280, y: 320 },
  exposure: { x: 280, y: 320 },
  viability: { x: 0, y: 520 },
}

function formatConfidence(confidence) {
  return `${Math.round(confidence * 100)}% confidence`
}

function createGraphNodes(scientificNodes, recommendedNodeId) {
  return scientificNodes.map((node, index) => ({
    id: node.id,
    position: nodePositions[node.id] ?? { x: (index % 3) * 260, y: Math.floor(index / 3) * 160 },
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

function calculateUncertainty(node) {
  return 1 - node.confidence
}

function findNode(nodeId, scientificNodes) {
  return scientificNodes.find((node) => node.id === nodeId)
}

function findDownstreamDescendants(nodeId, scientificNodes, visited = new Set()) {
  const node = findNode(nodeId, scientificNodes)

  if (!node) {
    return visited
  }

  node.downstream.forEach((downstreamNodeId) => {
    if (!visited.has(downstreamNodeId)) {
      visited.add(downstreamNodeId)
      findDownstreamDescendants(downstreamNodeId, scientificNodes, visited)
    }
  })

  return visited
}

function calculateDownstreamImpact(node, scientificNodes) {
  return Math.max(findDownstreamDescendants(node.id, scientificNodes).size, 1)
}

function isExperimentEligible(experiment, scientificNodes) {
  const node = findNode(experiment.tests_node, scientificNodes)

  if (!node || ['supported', 'contradicted'].includes(node.status)) {
    return false
  }

  return node.depends_on.every((prerequisiteNodeId) => {
    const prerequisiteNode = findNode(prerequisiteNodeId, scientificNodes)
    return prerequisiteNode?.status === 'supported'
  })
}

function scoreExperiment(experiment, scientificNodes) {
  const node = findNode(experiment.tests_node, scientificNodes)
  const uncertainty = calculateUncertainty(node)
  const downstreamImpact = calculateDownstreamImpact(node, scientificNodes)
  const score = (
    uncertainty
    * downstreamImpact
    * experiment.discriminating_power
    / (experiment.cost * experiment.time)
  )

  return {
    experiment,
    node,
    uncertainty,
    downstreamImpact,
    discriminatingPower: experiment.discriminating_power,
    cost: experiment.cost,
    time: experiment.time,
    score,
  }
}

// Temporary frontend mirror of backend/experiment_selector.py until a recommendation API exists.
function getTemporaryRecommendation(currentScenario) {
  const rankedExperiments = currentScenario.experiments
    .filter((experiment) => isExperimentEligible(experiment, currentScenario.nodes))
    .map((experiment) => scoreExperiment(experiment, currentScenario.nodes))
    .sort((left, right) => right.score - left.score)

  return rankedExperiments[0] ?? null
}

const recommendation = getTemporaryRecommendation(scenario)
const graphNodes = createGraphNodes(scenario.nodes, recommendation?.node.id)
const graphEdges = createGraphEdges(scenario.nodes)

function formatDecimal(value) {
  return Number(value).toFixed(3)
}

function App() {
  const [selectedNode, setSelectedNode] = useState(scenario.nodes[0])

  function handleNodeClick(_, flowNode) {
    const scientificNode = scenario.nodes.find((node) => node.id === flowNode.id)
    setSelectedNode(scientificNode)
  }

  const selectedExperiments = scenario.experiments.filter(
    (experiment) => experiment.tests_node === selectedNode?.id,
  )

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Adaptive repurposing prototype</p>
          <h1>{scenario.drug} -&gt; {scenario.disease}</h1>
          <p>{scenario.goal}</p>
        </div>
        <div className="legend" aria-label="Node status legend">
          <span className="legend-item supported">Supported</span>
          <span className="legend-item uncertain">Uncertain</span>
          <span className="legend-item contradicted">Contradicted</span>
          <span className="legend-item unexplored">Unexplored</span>
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
            {recommendation ? (
              <>
                <h2>{recommendation.experiment.name}</h2>
                <p className="question">
                  Tests <strong>{recommendation.node.name}</strong>, highlighted on the graph.
                </p>

                <dl className="score-grid">
                  <div>
                    <dt>Uncertainty</dt>
                    <dd>{formatDecimal(recommendation.uncertainty)}</dd>
                  </div>
                  <div>
                    <dt>Downstream Impact</dt>
                    <dd>{recommendation.downstreamImpact}</dd>
                  </div>
                  <div>
                    <dt>Discriminating Power</dt>
                    <dd>{formatDecimal(recommendation.discriminatingPower)}</dd>
                  </div>
                  <div>
                    <dt>Cost</dt>
                    <dd>{recommendation.cost}</dd>
                  </div>
                  <div>
                    <dt>Time</dt>
                    <dd>{recommendation.time}</dd>
                  </div>
                  <div className="score-total">
                    <dt>Final Score</dt>
                    <dd>{formatDecimal(recommendation.score)}</dd>
                  </div>
                </dl>

                <p className="reason">
                  {recommendation.experiment.name} ranked highest because it tests {recommendation.node.name}
                  {' '}with uncertainty {formatDecimal(recommendation.uncertainty)} and affects{' '}
                  {recommendation.downstreamImpact} downstream node(s), while having discriminating power{' '}
                  {formatDecimal(recommendation.discriminatingPower)} at cost {recommendation.cost} and time{' '}
                  {recommendation.time}.
                </p>
              </>
            ) : (
              <p className="muted">No eligible experiment is currently available.</p>
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
