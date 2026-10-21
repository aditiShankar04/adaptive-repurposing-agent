import { Handle, Position } from '@xyflow/react'
import StatusIcon from './StatusIcon.jsx'
import { statusLabel } from './status.js'

const ORB = 38

function DecisionNode({ data, selected }) {
  const { node, isRecommended } = data
  const confidencePercent = Math.round(node.confidence * 100)

  const className = [
    'waypoint',
    `tone-${node.status}`,
    selected ? 'is-selected' : '',
    isRecommended ? 'is-recommended' : '',
    data.isWeak ? 'is-weak' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={className}
      style={{ '--layer': data.layer }}
      role="button"
      aria-label={`${node.name}, ${node.status}, ${confidencePercent}% confidence${isRecommended ? ', next path: tests the recommended experiment' : ''}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="node-handle"
        style={{ left: `calc(50% - ${ORB / 2}px)`, top: ORB / 2 }}
        isConnectable={false}
      />

      <div className="waypoint-next-slot">
        {isRecommended && <span className="node-next-badge">next path</span>}
      </div>

      <div className="waypoint-orb">
        <StatusIcon status={node.status} size={16} />
      </div>

      <div className="node-status">{statusLabel(node.status)}</div>
      <div className="node-name" title={node.name}>{node.name}</div>
      <div className="node-confidence">
        confidence <span className="mono">{confidencePercent}%</span>
      </div>

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
