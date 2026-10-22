import { useRef, useState } from 'react'
import useInert from '../hooks/useInert.js'

function formatDecimal(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'n/a'
  return Number(value).toFixed(3)
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  )
}

function buildFallbackExplanation(recommendation) {
  const metrics = recommendation.metrics ?? {}
  return `${recommendation.experiment.name} ranked highest because the backend planner selected it for ${recommendation.node.name}, with uncertainty ${formatDecimal(metrics.uncertainty)}, marginal decision impact ${formatDecimal(metrics.marginal_decision_impact)}, discriminating power ${formatDecimal(metrics.discriminating_power)}, cost ${metrics.cost}, time ${metrics.time}, and score ${formatDecimal(metrics.score)}.`
}

function RecommendationPanel({
  isPreview,
  recommendation,
  plannerMessage,
  explanation,
  explanationLoading = false,
  unlockedNodes,
  onSelectNode,
  selectedResult,
  selectedQc,
  onResultChange,
  onQcChange,
  onSubmitResult,
  onRevealHistoricalEvidence,
  submitting,
  disabled,
  historicalReplay,
  sessionTerminated,
}) {
  const [expanded, setExpanded] = useState(false)
  const moreRef = useRef(null)
  useInert(moreRef, !expanded)

  if (isPreview) {
    return (
      <section className="hud" aria-label="your next quest">
        <p className="panel-eyebrow">your next quest</p>
        <p className="preview-note">preview only. uploaded scenarios are not backend-ranked until the session API accepts scenario data.</p>
      </section>
    )
  }

  if (!recommendation) {
    return (
      <section className="hud" aria-label="your next quest">
        <p className="panel-eyebrow">your next quest</p>
        <p className="muted">{plannerMessage ?? 'no eligible experiment is currently available.'}</p>
      </section>
    )
  }

  const metrics = recommendation.metrics ?? {}
  const why = explanation || recommendation.explanation || recommendation.recommendation_explanation || buildFallbackExplanation(recommendation)

  return (
    <section key={recommendation.experiment.id} className="hud hud-refresh" aria-label="your next quest">
      <p className="panel-eyebrow">your next quest</p>
      <p className="hud-descriptor">backend recommendation</p>
      <h2 className="recommendation-title">{recommendation.experiment.name}</h2>
      <p className="recommendation-tests">
        tests{' '}
        <button type="button" className="link-button" onClick={() => onSelectNode(recommendation.node.id)}>
          {recommendation.node.name}
        </button>
      </p>

      <dl className="hud-primary">
        <Stat label="decision impact" value={formatDecimal(metrics.marginal_decision_impact)} />
        <div className="stat stat-score">
          <dt>score</dt>
          <dd className="mono">{formatDecimal(metrics.score)}</dd>
        </div>
      </dl>

      <button
        type="button"
        className="hud-toggle"
        aria-expanded={expanded}
        aria-controls="hud-more"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{expanded ? 'hide details' : 'details · why this path?'}</span>
        <span className="hud-chevron" aria-hidden="true" />
      </button>

      <div ref={moreRef} id="hud-more" className={`hud-more${expanded ? ' is-open' : ''}`}>
        <div className="hud-more-inner">
          <dl className="hud-secondary">
            <Stat label="uncertainty" value={formatDecimal(metrics.uncertainty)} />
            <Stat label="downstream impact" value={metrics.downstream_impact ?? 'n/a'} />
            <Stat label="discriminating power" value={formatDecimal(metrics.discriminating_power)} />
            <Stat label="cost" value={metrics.cost ?? 'n/a'} />
            <Stat label="time" value={metrics.time ?? 'n/a'} />
          </dl>

          {unlockedNodes.length > 0 && (
            <p className="unlocks">
              <span className="unlocks-label">feeds into</span>
              {unlockedNodes.map((node) => (
                <button type="button" key={node.id} className="link-button" onClick={() => onSelectNode(node.id)}>
                  {node.name}
                </button>
              ))}
            </p>
          )}

          <div className="why">
            <h3>why this path?</h3>
            {explanationLoading ? (
              <p className="why-loading" role="status" aria-live="polite">interpreting planner reasoning<span className="why-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></p>
            ) : (
              <p>{why}</p>
            )}
          </div>

          {historicalReplay ? (
            <div className="run-control">
              <button type="button" className="run-button" disabled={disabled || submitting || sessionTerminated} onClick={onRevealHistoricalEvidence}>
                {submitting ? 'revealing...' : 'reveal historical outcome'}
              </button>
            </div>
          ) : (
            <form className="outcome-form" onSubmit={onSubmitResult}>
              <h3>outcome</h3>
              <label>
                <span>result</span>
                <select value={selectedResult} onChange={(event) => onResultChange(event.target.value)} disabled={disabled || submitting || sessionTerminated}>
                  <option value="positive">positive</option>
                  <option value="negative">negative</option>
                  <option value="inconclusive">inconclusive</option>
                </select>
              </label>
              <label>
                <span>qc</span>
                <select value={selectedQc} onChange={(event) => onQcChange(event.target.value)} disabled={disabled || submitting || sessionTerminated}>
                  <option value="pass">pass</option>
                  <option value="questionable">questionable</option>
                  <option value="fail">fail</option>
                </select>
              </label>
              <button type="submit" className="run-button" disabled={disabled || submitting || sessionTerminated}>
                {submitting ? 'applying...' : 'record outcome'}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

export default RecommendationPanel
