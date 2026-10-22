import Wordmark from './Wordmark.jsx'

function LandingPage({ onGetStarted, skipIntro }) {
  return (
    <main className={`screen screen-landing${skipIntro ? ' no-intro' : ''}`}>
      <h1 className="landing-title">
        <Wordmark size="lg" animate={!skipIntro} />
      </h1>

      <p className="landing-tagline reveal" style={{ '--d': '1900ms' }}>
        navigate the maze of discovery.
      </p>

      <p className="landing-description reveal" style={{ '--d': '2200ms' }}>
        find the experiment that moves discovery forward.
      </p>

      <button type="button" className="primary-button reveal" style={{ '--d': '2500ms' }} onClick={onGetStarted}>
        <span>get started</span>
        <span className="cta-line" aria-hidden="true" />
      </button>
    </main>
  )
}

export default LandingPage
