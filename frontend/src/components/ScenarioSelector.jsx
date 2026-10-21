import { useState } from 'react'
import ScenarioUpload from './ScenarioUpload.jsx'

const REQUIRED_FIELDS = [
  ['drug, disease', 'text'],
  ['nodes[]', 'id, name, status, confidence (0 to 1), depends_on[], downstream[]'],
  ['experiments[]', 'id, name, tests_node, cost, time, discriminating_power (0 to 1)'],
]

function ScenarioSelector({ samples, onSelectBuiltIn, onUploadFile, uploadState, onBack, loadingKey }) {
  const [showFields, setShowFields] = useState(false)

  return (
    <main className="screen screen-select">
      <button type="button" className="text-button" onClick={onBack}>back</button>

      <section className="upload-section" aria-labelledby="upload-heading">
        <h2 id="upload-heading" className="screen-heading">upload your research scenario</h2>
        <p className="screen-note">
          files must follow the labyrinth scenario json format.{' '}
          <button
            type="button"
            className="inline-link"
            aria-expanded={showFields}
            aria-controls="required-fields"
            onClick={() => setShowFields((value) => !value)}
          >
            {showFields ? 'hide required fields' : 'view required fields'}
          </button>
        </p>
        {showFields && (
          <dl id="required-fields" className="required-fields">
            {REQUIRED_FIELDS.map(([name, detail]) => (
              <div key={name}>
                <dt className="mono">{name}</dt>
                <dd>{detail}</dd>
              </div>
            ))}
          </dl>
        )}

        <ScenarioUpload onFile={onUploadFile} validatingName={uploadState?.fileName} />
      </section>

      <section className="samples" aria-labelledby="builtin-heading">
        <h2 id="builtin-heading" className="samples-label">or try a sample scenario</h2>
        <ul className="sample-list">
          {samples.map((entry) => (
            <li key={entry.key}>
              <button
                type="button"
                className="sample-link"
                title={entry.title}
                onClick={() => onSelectBuiltIn(entry)}
                disabled={Boolean(loadingKey)}
              >
                {loadingKey === entry.key ? 'loading...' : entry.label}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default ScenarioSelector
