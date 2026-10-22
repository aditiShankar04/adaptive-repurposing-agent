import { useState } from 'react'

function formatDecimal(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'n/a'
  return Number(value).toFixed(3)
}

// hint says what the number means, in plain words; it never adds a judgement the planner did not make.
function Stat({ label, value, hint, className = '' }) {
  return (
    <div className={`stat ${className}`}>
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
      {hint ? <dd className="stat-hint">{hint}</dd> : null}
    </div>
  )
}

function MinimizeButton({ label, onClick }) {
  return (
    <button type="button" className="panel-minimize" onClick={onClick} aria-label={label} title="minimize">
      <span aria-hidden="true" />
    </button>
  )
}

function buildFallbackExplanation(recommendation) {
  const metrics = recommendation.metrics ?? {}
  return `${recommendation.experiment.name} ranked highest because the backend planner selected it for ${recommendation.node.name}, with uncertainty ${formatDecimal(metrics.uncertainty)}, marginal decision impact ${formatDecimal(metrics.marginal_decision_impact)}, discriminating power ${formatDecimal(metrics.discriminating_power)}, cost ${metrics.cost}, time ${metrics.time}, and score ${formatDecimal(metrics.score)}.`
}

function ScoreMath({ metrics }) {
  return (
    <div className="score-math">
      <h3>how the score is built</h3>
      <p className="score-equation mono">
        <span><b>{formatDecimal(metrics.uncertainty)}</b> uncertainty</span>
        <span>× <b>{formatDecimal(metrics.marginal_decision_impact)}</b> decision impact</span>
        <span>× <b>{formatDecimal(metrics.discriminating_power)}</b> discriminating power</span>
        <span>÷ (<b>{metrics.cost ?? 'n/a'}</b> cost × <b>{metrics.time ?? 'n/a'}</b> time)</span>
        <span className="score-result">= <b>{formatDecimal(metrics.score)}</b> score</span>
      </p>
      <p className="score-note">scores only compare experiments with each other. the highest one becomes your next quest.</p>
    </div>
  )
}

function RecommendationPanel({
  isPreview,
  recommendation,
  rankedCount = 0,
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
  minimized = false,
  onToggleMinimized,
}) {
  const [openSection, setOpenSection] = useState(null)
  const toggleSection = (section) => setOpenSection((current) => (current === section ? null : section))

  if (minimized && !isPreview) {
    return (
      <button type="button" className="panel-pill hud-pill" onClick={onToggleMinimized} aria-label="expand your next quest">
        <span className="panel-pill-label">your next quest</span>
        <span className="panel-pill-value">{recommendation ? recommendation.experiment.name : (plannerMessage ?? 'no eligible experiment')}</span>
        <span className="panel-pill-expand" aria-hidden="true" />
      </button>
    )
  }

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
        <MinimizeButton label="minimize your next quest" onClick={onToggleMinimized} />
        <p className="panel-eyebrow">your next quest</p>
        <p className="muted">{plannerMessage ?? 'no eligible experiment is currently available.'}</p>
      </section>
    )
  }

  const metrics = recommendation.metrics ?? {}
  const locked = disabled || submitting || sessionTerminated
  // Visible scenario flag: illustrative experiments say outright that no history exists.
  const historyAvailable = recommendation.experiment.historical_result_available !== false
  const why = explanation || recommendation.explanation || recommendation.recommendation_explanation || buildFallbackExplanation(recommendation)
  const rank = recommendation.rank ?? 1

  return (
    <section key={recommendation.experiment.id} className="hud hud-refresh" aria-label="your next quest">
      <MinimizeButton label="minimize your next quest" onClick={onToggleMinimized} />
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
        <Stat
          label="decision impact"
          value={formatDecimal(metrics.marginal_decision_impact)}
          hint="how much the result could change the path to a decision (0–1)"
        />
        <Stat
          className="stat-score"
          label="score"
          value={formatDecimal(metrics.score)}
          hint={rankedCount > 1 ? `ranked #${rank} of ${rankedCount} candidate experiments` : 'the only candidate experiment'}
        />
      </dl>

      <div className="hud-tabs" role="group" aria-label="more about this recommendation">
        <button
          type="button"
          className={`hud-tab${openSection === 'details' ? ' is-active' : ''}`}
          aria-expanded={openSection === 'details'}
          aria-controls="hud-details"
          onClick={() => toggleSection('details')}
        >
          <span className="hud-tab-icon" aria-hidden="true">#</span>
          details
          <span className="hud-chevron" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`hud-tab${openSection === 'why' ? ' is-active' : ''}`}
          aria-expanded={openSection === 'why'}
          aria-controls="hud-why"
          onClick={() => toggleSection('why')}
        >
          <span className="hud-tab-icon" aria-hidden="true">?</span>
          why this path?
          <span className="hud-chevron" aria-hidden="true" />
        </button>
      </div>

      {openSection === 'details' && (
        <div id="hud-details" className="hud-section">
          <dl className="hud-secondary">
            <Stat label="uncertainty" value={formatDecimal(metrics.uncertainty)} hint="1 − confidence in the tested node" />
            <Stat label="discriminating power" value={formatDecimal(metrics.discriminating_power)} hint="how cleanly it separates yes from no" />
            <Stat label="cost" value={metrics.cost ?? 'n/a'} hint="relative, 1 (low) to 5 (high)" />
            <Stat label="time" value={metrics.time ?? 'n/a'} hint="relative, 1 (fast) to 5 (slow)" />
            <Stat label="downstream impact" value={metrics.downstream_impact ?? 'n/a'} hint="nodes that depend on this one (not in the score)" />
          </dl>

          <ScoreMath metrics={metrics} />

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
        </div>
      )}

      {openSection === 'why' && (
        <div id="hud-why" className="hud-section why">
          <h3>why the planner picked this experiment</h3>
          {explanationLoading ? (
            <p className="why-loading" role="status" aria-live="polite">interpreting planner reasoning<span className="why-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></p>
          ) : (
            <p>{why}</p>
          )}
        </div>
      )}

      {/* Each recommendation takes exactly one result: explored or (historical scenarios only) revealed. */}
      <div className="outcome-actions">
        <form className="outcome-form" onSubmit={onSubmitResult}>
          <h3>explore an outcome</h3>
          <p className="action-note">enter an outcome and see how labyrinth adapts.</p>
          <label>
            <span>result</span>
            <select value={selectedResult} onChange={(event) => onResultChange(event.target.value)} disabled={locked} required>
              <option value="" disabled>select a result</option>
              <option value="positive">supports hypothesis</option>
              <option value="negative">contradicts hypothesis</option>
              <option value="inconclusive">inconclusive</option>
            </select>
          </label>
          <label>
            <span>qc</span>
            <select value={selectedQc} onChange={(event) => onQcChange(event.target.value)} disabled={locked} required>
              <option value="" disabled>select qc</option>
              <option value="pass">pass</option>
              <option value="questionable">questionable</option>
              <option value="fail">fail</option>
            </select>
          </label>
          <button type="submit" className="run-button" disabled={locked || !selectedResult || !selectedQc}>
            {submitting ? 'applying...' : 'submit result'}
          </button>
        </form>

        {historicalReplay && (
          <>
            <p className="action-divider"><span>or</span></p>
            <div className="run-control">
              <h3>replay history</h3>
              {historyAvailable ? (
                <p className="action-note">reveal what was actually observed for this experiment.</p>
              ) : (
                <p className="action-note">no historical record exists for this experiment. explore an outcome instead.</p>
              )}
              <button type="button" className="run-button run-button-secondary" disabled={locked || !historyAvailable} onClick={onRevealHistoricalEvidence}>
                {submitting ? 'applying...' : 'reveal historical result'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

export default RecommendationPanel
