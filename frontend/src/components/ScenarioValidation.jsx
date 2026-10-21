import ScenarioUpload from './ScenarioUpload.jsx'

const lowerFirst = (message) => message.replace(/^([A-Z])(?=[a-z])/, (letter) => letter.toLowerCase())

function ScenarioValidation({ fileName, result, onEnter, onUploadFile, uploadState, onBack }) {
  if (!result.ok) {
    return (
      <main className="screen screen-validation">
        <section className="validation-panel is-error" aria-live="polite">
          <h2 className="validation-title">this file doesn't match the labyrinth scenario format.</h2>
          {fileName && <p className="validation-file mono">{fileName}</p>}

          <ul className="validation-errors">
            {result.errors.map((message) => <li key={message}>{lowerFirst(message)}</li>)}
          </ul>
          {result.hiddenErrorCount > 0 && (
            <p className="validation-more">...and {result.hiddenErrorCount} more.</p>
          )}

          <ScenarioUpload onFile={onUploadFile} validatingName={uploadState?.fileName} />
          <button type="button" className="text-button" onClick={onBack}>back to scenarios</button>
        </section>
      </main>
    )
  }

  const { drug, disease, nodeCount, experimentCount } = result.summary

  return (
    <main className="screen screen-validation">
      <section className="validation-panel is-ready" aria-live="polite">
        <p className="validation-ok"><span className="check-pop" aria-hidden="true">✓</span> scenario ready</p>
        <h2 className="validation-title">
          {drug} <span className="validation-arrow" aria-label="for">→</span> {disease}
        </h2>
        <p className="validation-counts">
          <span className="mono">{nodeCount}</span> nodes · <span className="mono">{experimentCount}</span> experiments
        </p>
        <p className="screen-note">
          uploaded scenarios are preview-only in this build because the backend session API accepts named scenarios only.
        </p>

        <div className="validation-actions">
          <button type="button" className="primary-button" onClick={onEnter}>
            <span>enter labyrinth</span>
            <span className="cta-line" aria-hidden="true" />
          </button>
          <button type="button" className="text-button" onClick={onBack}>choose another file</button>
        </div>
      </section>
    </main>
  )
}

export default ScenarioValidation
