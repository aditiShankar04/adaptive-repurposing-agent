import './Wordmark.css'

function Wordmark({ size = 'lg', animate = false }) {
  const className = `wordmark wordmark-${size}${animate ? ' is-animated' : ''}`

  return (
    <span className={className}>
      <span className="wordmark-text">labyrinth</span>
    </span>
  )
}

export default Wordmark
