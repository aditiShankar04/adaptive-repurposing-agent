import StatusIcon from './StatusIcon.jsx'
import { STATUS_LABELS } from './status.js'

function StatusLegend() {
  return (
    <ul className="legend" aria-label="node status legend">
      {Object.entries(STATUS_LABELS).map(([status, label]) => (
        <li key={status} className={`legend-item tone-${status}`}>
          <StatusIcon status={status} size={12} />
          {label}
        </li>
      ))}
    </ul>
  )
}

export default StatusLegend
