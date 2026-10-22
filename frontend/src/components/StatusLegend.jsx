import StatusIcon from './StatusIcon.jsx'
import { STATUS_LABELS } from './status.js'

// Strategy keys only appear when the backend actually supplied that data.
function StatusLegend({ showProjected = false, showMuted = false }) {
  return (
    <ul className="legend" aria-label="node status legend">
      {Object.entries(STATUS_LABELS).map(([status, label]) => (
        <li key={status} className={`legend-item tone-${status}`}>
          <StatusIcon status={status} size={12} />
          {label}
        </li>
      ))}
      {showProjected && (
        <li className="legend-item legend-projected">
          <span className="legend-projected-swatch" aria-hidden="true" />
          current projected path
        </li>
      )}
      {showMuted && (
        <li className="legend-item legend-muted">
          <span className="legend-muted-swatch" aria-hidden="true" />
          optional / redundant
        </li>
      )}
    </ul>
  )
}

export default StatusLegend
