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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://adaptive-repurposing-agent.onrender.com'

const LEAVE_MS = 380
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
  { key: 'sildenafil', label: 'sildenafil', title: 'Sildenafil FGR historical replay' },
  { key: 'demo', label: 'demo', title: 'Demo scenario' },
]

function App() {
  const reduced = useReducedMotion()
  const [screen, setScreen] = useState('landing')
  const [pendingScreen, setPendingScreen] = useState(null)
  const [sweepToken, setSweepToken] = useState(0)
  const [introPlayed, setIntroPlayed] = useState(false)
  const screenRef = useRef('landing')
  const navigating = useRef(false)
  const [sessionId, setSessionId] = useState(null)
  const [plannerState, setPlannerState] = useState(null)
  const [previewScenario, setPreviewScenario] = useState(null)
  const [previewFileName, setPreviewFileName] = useState(null)
  const [loadCount, setLoadCount] = useState(0)
  const [upload, setUpload] = useState(null)
  const [uploadState, setUploadState] = useState(null)
  const [loadingKey, setLoadingKey] = useState(null)
  const [error, setError] = useState(null)
  const [selectedResult, setSelectedResult] = useState('')
  const [selectedQc, setSelectedQc] = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [explanation, setExplanation] = useState(null)
  const [explanationLoading, setExplanationLoading] = useState(false)
  const timers = useRef([])
  const applying = useRef(false)

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useEffect(() => {
  const recommendationId = plannerState?.recommendation?.experiment_id

  if (!sessionId || !recommendationId) {
    setExplanation(null)
    return
  }

  let ignore = false

  async function fetchExplanation() {
    setExplanation(null)
    setExplanationLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/explain`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ?? `Labyrinth API returned ${response.status}`
        )
      }

      if (!ignore) {
        setExplanation(
          data.llm_explanation?.recommendation_explanation ?? null
        )
      }
    } catch (fetchError) {
      console.error('Failed to load recommendation explanation:', fetchError)

      if (!ignore) {
        setExplanation(null)
      }
    } finally {
      if (!ignore) {
        setExplanationLoading(false)
      }
    }
  }

  fetchExplanation()

  return () => {
    ignore = true
  }
}, [sessionId, plannerState?.recommendation?.experiment_id])

  function later(callback, ms) {
    timers.current.push(setTimeout(callback, ms))
  }

  function go(next) {
    // Ref-based lock: a second click during the leave animation can never start another swap.
    if (navigating.current) return
    const from = screenRef.current
    if (reduced) {
      if (from === 'landing') setIntroPlayed(true)
      screenRef.current = next
      setScreen(next)
      return
    }
    navigating.current = true
    setPendingScreen(next)
    if (from === 'landing' && next === 'scenario-select') setSweepToken((token) => token + 1)
    // The swap happens only after the leave animation has fully finished (opacity 0), and
    // the environment keeps running underneath, so nothing resets or overlaps.
    later(() => {
      if (from === 'landing') setIntroPlayed(true)
      screenRef.current = next
      setScreen(next)
      setPendingScreen(null)
      navigating.current = false
    }, LEAVE_MS + 40)
  }

  async function createBackendSession(scenarioKey) {
    setLoadingKey(scenarioKey)
    setError(null)
    setLastUpdate(null)
    setSelectedResult('')
    setSelectedQc('')
    setSessionId(null)
    setPlannerState(null)
    setPreviewScenario(null)
    setPreviewFileName(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions`, {
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

  // One result per recommendation: the ref lock blocks a second submit/reveal before
  // the replanned state arrives, so nothing is applied to a stale recommendation.
  async function applyResult(path, body) {
    if (applying.current || !sessionId) return
    applying.current = true
    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `Labyrinth API returned ${response.status}`)
      setPlannerState(data.planner_state)
      setLastUpdate(data)
      setSelectedResult('')
      setSelectedQc('')
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      applying.current = false
      setSubmitting(false)
    }
  }

  function handleSubmitResult(event) {
    event.preventDefault()
    const topRankedExperiment = plannerState?.ranked_experiments?.[0] ?? null
    if (!topRankedExperiment || !selectedResult || !selectedQc) return
    applyResult('result', {
      experiment_id: topRankedExperiment.experiment.id,
      result: selectedResult,
      qc: selectedQc,
    })
  }

  function handleRevealHistoricalEvidence() {
    if (!plannerState?.ranked_experiments?.[0]) return
    applyResult('reveal-historical-result', {})
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
          explanation={explanation}
          explanationLoading={explanationLoading}
          previewScenario={previewScenario}
          previewFileName={previewFileName}
          onChangeScenario={goToSelector}
          onEndExploration={goToSelector}
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
