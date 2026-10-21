import StatusIcon from './StatusIcon.jsx'
import { statusLabel } from './status.js'

function NodeList({ ids = [], nodeById, onSelectNode }) {
  if (!ids.length) return <span className="muted">none</span>
  return (
    <span className="node-link-list">
      {ids.map((id) => (
        <button type="button" key={id} className="link-button" onClick={() => onSelectNode(id)}>
          {nodeById[id]?.name ?? id}
        </button>
      ))}
    </span>
  )
}

const LOGIC_LABELS = { all: 'needs all of', any: 'needs any of' }

function EvidenceGroup({ title, items }) {
  if (!items?.length) return null
  return (
    <div className="evidence-group">
      <h4>{title}</h4>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}

function NodeDetailPanel({ node, nodeById, experiments, recommendedExperimentId, onSelectNode, onClose }) {
  if (!node) return null

  const confidencePercent = Math.round(node.confidence * 100)
  const dependsLabel = node.depends_on?.length > 1 && LOGIC_LABELS[node.dependency_logic]
    ? LOGIC_LABELS[node.dependency_logic]
    : 'depends on'
  const isDecisionPoint = node.node_type === 'final_decision'
  const hasEvidence = Boolean(
    node.evidence
    && (node.evidence.supporting?.length || node.evidence.contradicting?.length || node.evidence.gaps?.length),
  )

  return (
    <section className="detail-panel" aria-label="selected node details" aria-live="polite">
      <button type="button" className="detail-close" onClick={onClose} aria-label="close details">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
          <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </svg>
      </button>

      <div className="detail-tags">
        <p className={`status-tag status-${node.status}`}>
          <StatusIcon status={node.status} size={12} />
          {statusLabel(node.status)}
        </p>
        {isDecisionPoint && <p className="decision-tag">decision point</p>}
      </div>

      <h2 className="detail-title">{node.name}</h2>
      <p className="detail-question">{node.question}</p>

      <dl className="detail-facts">
        <div>
          <dt>confidence</dt>
          <dd><span className="mono">{confidencePercent}%</span></dd>
        </div>
      </dl>

      <h3 className="detail-heading">paths / dependencies</h3>
      <dl className="detail-facts">
        <div>
          <dt>{dependsLabel}</dt>
          <dd><NodeList ids={node.depends_on} nodeById={nodeById} onSelectNode={onSelectNode} /></dd>
        </div>
        <div>
          <dt>downstream</dt>
          <dd><NodeList ids={node.downstream} nodeById={nodeById} onSelectNode={onSelectNode} /></dd>
        </div>
      </dl>

      <h3 className="detail-heading">
        available moves <span className="detail-heading-sub">candidate experiments</span>
      </h3>
      {experiments.length ? (
        <ul className="experiment-list">
          {experiments.map((experiment) => (
            <li key={experiment.id}>
              <span className="experiment-name">
                {experiment.name}
                {experiment.id === recommendedExperimentId && <span className="experiment-flag">next move</span>}
              </span>
              <dl className="move-stats">
                <div><dt>cost</dt><dd className="mono">{experiment.cost}</dd></div>
                <div><dt>time</dt><dd className="mono">{experiment.time}</dd></div>
                <div><dt>power</dt><dd className="mono">{experiment.discriminating_power}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">no experiment defined for this node yet.</p>
      )}

      {hasEvidence && (
        <details className="evidence">
          <summary>evidence</summary>
          <EvidenceGroup title="supporting" items={node.evidence.supporting} />
          <EvidenceGroup title="contradicting" items={node.evidence.contradicting} />
          <EvidenceGroup title="gaps" items={node.evidence.gaps} />
        </details>
      )}
    </section>
  )
}

export default NodeDetailPanel
