import { useEffect, useRef, useState } from 'react'
import './App.css'
import './screens.css'

import Environment from './components/Environment.jsx'
import LandingPage from './components/LandingPage.jsx'
import ResearchWorkspace from './components/ResearchWorkspace.jsx'
import ScenarioSelector from './components/ScenarioSelector.jsx'
import ScenarioValidation from './components/ScenarioValidation.jsx'
import useReducedMotion from './hooks/useReducedMotion.js'
import { readScenarioFile } from './scenarioValidation.js'

const LEAVE_MS = 420
const MIN_VALIDATING_MS = 400
const ENVIRONMENT_STAGE = {
  landing: 'landing',
  'scenario-select': 'select',
  validation: 'select',
  workspace: 'workspace',
}
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

const scenarioSamples = [
  { key: 'propranolol', label: 'propranolol', title: 'Propranolol historical replay' },
  { key: 'xanomeline', label: 'xanomeline', title: 'Xanomeline PDP scenario' },
  { key: 'demo', label: 'demo', title: 'Demo scenario' },
]

function App() {
  const reduced = useReducedMotion()
  const [screen, setScreen] = useState('landing')
  const [pendingScreen, setPendingScreen] = useState(null)
  const [sweepToken, setSweepToken] = useState(0)
  const [introPlayed, setIntroPlayed] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [plannerState, setPlannerState] = useState(null)
  const [previewScenario, setPreviewScenario] = useState(null)
  const [previewFileName, setPreviewFileName] = useState(null)
  const [loadCount, setLoadCount] = useState(0)
  const [upload, setUpload] = useState(null)
  const [uploadState, setUploadState] = useState(null)
  const [loadingKey, setLoadingKey] = useState(null)
  const [error, setError] = useState(null)
  const [selectedResult, setSelectedResult] = useState('positive')
  const [selectedQc, setSelectedQc] = useState('pass')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const timers = useRef([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function later(callback, ms) {
    timers.current.push(setTimeout(callback, ms))
  }

  function go(next) {
    if (pendingScreen) return
    if (screen === 'landing') setIntroPlayed(true)
    if (reduced) {
      setScreen(next)
      return
    }
    setPendingScreen(next)
    if (screen === 'landing' && next === 'scenario-select') setSweepToken((token) => token + 1)
    later(() => {
      setScreen(next)
      setPendingScreen(null)
    }, LEAVE_MS)
  }

  async function createBackendSession(scenarioKey) {
    setLoadingKey(scenarioKey)
    setError(null)
    setLastUpdate(null)
    setSessionId(null)
    setPlannerState(null)
    setPreviewScenario(null)
    setPreviewFileName(null)

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: scenarioKey }),
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error ?? `Labyrinth API returned ${response.status}`)

      setSessionId(data.session_id)
      setPlannerState(data.planner_state)
      setLoadCount((count) => count + 1)
      go('workspace')
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      setLoadingKey(null)
    }
  }

  async function handleUploadFile(file) {
    setUploadState({ fileName: file.name })
    const [result] = await Promise.all([readScenarioFile(file), reduced ? null : wait(MIN_VALIDATING_MS)])
    setUpload({ fileName: file.name, result })
    setUploadState(null)
    if (screen === 'validation') setScreen('validation')
    else go('validation')
  }

  function openUploadedPreview() {
    if (!upload?.result.ok) return
    setSessionId(null)
    setPlannerState(null)
    setLastUpdate(null)
    setError(null)
    setPreviewScenario(upload.result.scenario)
    setPreviewFileName(upload.fileName)
    setLoadCount((count) => count + 1)
    go('workspace')
  }

  function goToSelector() {
    setUpload(null)
    setError(null)
    go('scenario-select')
  }

  async function handleSubmitResult(event) {
    event.preventDefault()
    const topRankedExperiment = plannerState?.ranked_experiments?.[0] ?? null
    if (!sessionId || !topRankedExperiment) return

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/sessions/${sessionId}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          experiment_id: topRankedExperiment.experiment.id,
          result: selectedResult,
          qc: selectedQc,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `Labyrinth API returned ${response.status}`)
      setPlannerState(data.planner_state)
      setLastUpdate(data)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRevealHistoricalEvidence() {
    if (!sessionId || !plannerState?.ranked_experiments?.[0]) return
    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/sessions/${sessionId}/reveal-historical-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `Labyrinth API returned ${response.status}`)
      setPlannerState(data.planner_state)
      setLastUpdate(data)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  let content = null
  if (screen === 'landing') {
    content = <LandingPage skipIntro={introPlayed} onGetStarted={() => go('scenario-select')} />
  } else if (screen === 'scenario-select') {
    content = (
      <>
        {error && <p className="flow-error" role="alert">labyrinth api error: {error}</p>}
        <ScenarioSelector
          samples={scenarioSamples}
          onSelectBuiltIn={(entry) => createBackendSession(entry.key)}
          onUploadFile={handleUploadFile}
          uploadState={uploadState}
          onBack={() => go('landing')}
          loadingKey={loadingKey}
        />
      </>
    )
  } else if (screen === 'validation' && upload) {
    content = (
      <ScenarioValidation
        fileName={upload.fileName}
        result={upload.result}
        onEnter={openUploadedPreview}
        onUploadFile={handleUploadFile}
        uploadState={uploadState}
        onBack={goToSelector}
      />
    )
  } else if (screen === 'workspace' && (plannerState || previewScenario)) {
    content = (
      <>
        {error && <p className="workspace-error" role="alert">labyrinth api error: {error}</p>}
        <ResearchWorkspace
          key={loadCount}
          plannerState={plannerState}
          previewScenario={previewScenario}
          previewFileName={previewFileName}
          onChangeScenario={goToSelector}
          onSubmitResult={handleSubmitResult}
          onRevealHistoricalEvidence={handleRevealHistoricalEvidence}
          selectedResult={selectedResult}
          selectedQc={selectedQc}
          onResultChange={setSelectedResult}
          onQcChange={setSelectedQc}
          submitting={submitting}
          lastUpdate={lastUpdate}
        />
      </>
    )
  }

  const environmentStage = ENVIRONMENT_STAGE[pendingScreen ?? screen]

  return (
    <div className="app-root">
      <Environment stage={environmentStage} sweepToken={sweepToken} />
      <div key={screen} className={`stage stage-${screen}${pendingScreen ? ' is-leaving' : ''}`}>
        {content}
      </div>
    </div>
  )
}

export default App
