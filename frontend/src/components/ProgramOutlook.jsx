import { useState } from 'react'
import StatusIcon from './StatusIcon.jsx'
import { outlookHeadline } from './outlook.js'

// Renders planner.decision_outlook exactly as the backend reports it.
// go_reachable is structural (a viable path to GO still exists), never a probability.

function GateList({ title, gates }) {
  if (!gates?.length) return null
  return (
    <div className="outlook-group">
      <h4>{title}</h4>
      <ul>
        {gates.map((gate) => (
          <li key={gate.id} className={`tone-${gate.status}`}>
            <StatusIcon status={gate.status} size={12} />
            <span>{gate.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Counts first, full lists on request: keeps the panel small while the graph is busy.
function OutlookGates({ outlook }) {
  const [open, setOpen] = useState(false)
  const counts = [
    ['supported', outlook.supported_required_gates?.length ?? 0],
    ['remaining', outlook.unresolved_required_gates?.length ?? 0],
    ['blockers', outlook.current_blockers?.length ?? 0],
  ]
  return (
    <>
      <button type="button" className="outlook-summary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="outlook-counts">
          {counts.map(([label, count]) => (
            <span key={label}><b>{count}</b> {label}</span>
          ))}
        </span>
        <span className="outlook-summary-action">{open ? 'hide gates' : 'show gates'}</span>
      </button>
      {open && (
        <>
          <GateList title="supported required gates" gates={outlook.supported_required_gates} />
          <GateList title="remaining required gates" gates={outlook.unresolved_required_gates} />
          <GateList title="current blockers" gates={outlook.current_blockers} />
        </>
      )}
    </>
  )
}

function MinimizeButton({ onClick }) {
  return (
    <button type="button" className="panel-minimize" onClick={onClick} aria-label="minimize program outlook" title="minimize">
      <span aria-hidden="true" />
    </button>
  )
}

function FinalDecision({ details, decision, activeRestrictions, onMinimize }) {
  return (
    <section className="final-decision-card" aria-label="final decision">
      <MinimizeButton onClick={onMinimize} />
      <p className="panel-eyebrow">final decision</p>
      <h2>
        {details ? `${details.node_name ?? details.node?.name ?? 'decision'}: ${details.decision}` : decision}
      </h2>
      {details?.reason ? <p>{details.reason}</p> : null}
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
      {details?.dependencies?.length ? (
        <dl className="decision-dependencies">
          {details.dependencies.map((dependency) => (
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

function ProgramOutlook({ outlook, plannerMessage, activeRestrictions = [], minimized = false, onToggleMinimized }) {
  if (!outlook) return null

  if (minimized) {
    const final = ['final_decision_reached', 'no_go'].includes(outlook.state)
    return (
      <button type="button" className="panel-pill" onClick={onToggleMinimized} aria-label="expand program outlook">
        <span className="panel-pill-label">{final ? 'final decision' : 'program outlook'}</span>
        <span className="panel-pill-value">{final ? outlook.final_decision : outlookHeadline(outlook)}</span>
        <span className="panel-pill-expand" aria-hidden="true" />
      </button>
    )
  }

  if (outlook.state === 'final_decision_reached') {
    return (
      <FinalDecision
        details={outlook.final_decision_details}
        decision={outlook.final_decision}
        activeRestrictions={activeRestrictions}
        onMinimize={onToggleMinimized}
      />
    )
  }

  if (outlook.state === 'no_go') {
    return (
      <section className="final-decision-card is-no-go" aria-label="final decision">
        <MinimizeButton onClick={onToggleMinimized} />
        <p className="panel-eyebrow">final decision</p>
        <h2>NO-GO</h2>
        <OutlookGates outlook={outlook} />
      </section>
    )
  }

  const deadEnd = outlook.state === 'dead_end_more_evidence'

  return (
    <section className={`outlook-card${deadEnd ? ' is-dead-end' : ''}`} aria-label="program outlook" aria-live="polite">
      <MinimizeButton onClick={onToggleMinimized} />
      <p className="panel-eyebrow">program outlook</p>
      <h2>{deadEnd ? 'more evidence / new path required' : 'more evidence required'}</h2>
      {deadEnd && plannerMessage ? <p className="outlook-line">{plannerMessage}</p> : null}
      <p className="outlook-line">
        {outlook.go_reachable ? 'a path to GO remains open.' : 'no structurally viable path to GO remains.'}
      </p>
      <OutlookGates outlook={outlook} />
    </section>
  )
}

export default ProgramOutlook
