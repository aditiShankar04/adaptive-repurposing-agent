import { Handle, Position } from '@xyflow/react'
import StatusIcon from './StatusIcon.jsx'
import { statusLabel } from './status.js'

const ORB = 38

function DecisionNode({ data, selected }) {
  const { node, isRecommended, isProjected, mutedReason, change } = data
  const confidencePercent = Math.round(node.confidence * 100)

  const className = [
    'waypoint',
    `tone-${node.status}`,
    selected ? 'is-selected' : '',
    isRecommended ? 'is-recommended' : '',
    data.isWeak ? 'is-weak' : '',
    isProjected ? 'is-projected' : '',
    mutedReason ? 'is-muted' : '',
    change ? 'is-resolving' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={className}
      style={{ '--layer': data.layer }}
      role="button"
      aria-label={`${node.name}, ${node.status}, ${confidencePercent}% confidence${isRecommended ? ', tests the recommended next experiment' : ''}${isProjected ? ', on the current projected path' : ''}${mutedReason ? ', optional for the current decision' : ''}${change ? `, just updated from ${change.fromStatus} to ${change.toStatus}` : ''}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="node-handle"
        style={{ left: `calc(50% - ${ORB / 2}px)`, top: ORB / 2 }}
        isConnectable={false}
      />

      <div className="waypoint-next-slot">
        {isRecommended && <span className="node-next-badge">next experiment</span>}
      </div>

      <div className="waypoint-orb">
        {change && <span key={change.key} className="orb-ripple" aria-hidden="true" />}
        <StatusIcon status={node.status} size={16} />
      </div>

      <div className="node-status">{statusLabel(node.status)}</div>
      {change && change.statusChanged && (
        <div key={change.key} className="node-change" role="status">
          {statusLabel(change.fromStatus)} <span aria-hidden="true">→</span> {statusLabel(change.toStatus)}
        </div>
      )}
      <div className="node-name" title={node.name}>{node.name}</div>
      <div className="node-confidence">
        confidence <span className="mono">{confidencePercent}%</span>
      </div>
      {mutedReason && <div className="node-muted-note">optional</div>}

      <Handle
        type="source"
        position={Position.Right}
        className="node-handle"
        style={{ left: `calc(50% + ${ORB / 2}px)`, top: ORB / 2 }}
        isConnectable={false}
      />
    </div>
  )
}

export default DecisionNode
