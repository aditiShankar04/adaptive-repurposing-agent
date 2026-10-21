import { useRef, useState } from 'react'

function ScenarioUpload({ onFile, validatingName }) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const isValidating = Boolean(validatingName)

  function handleFiles(fileList) {
    const file = fileList?.[0]
    if (file && !isValidating) onFile(file)
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)
    handleFiles(event.dataTransfer.files)
  }

  function handleChange(event) {
    handleFiles(event.target.files)
    event.target.value = ''
  }

  const className = `upload-field${isDragging ? ' is-dragging' : ''}${isValidating ? ' is-validating' : ''}`
  const label = isValidating ? 'checking scenario...' : isDragging ? 'release to load scenario' : 'drop .json or choose file'

  return (
    <div
      className={className}
      onDragOver={(event) => { event.preventDefault(); if (!isValidating) setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <button
        type="button"
        className="upload-field-button"
        onClick={() => inputRef.current?.click()}
        disabled={isValidating}
      >
        <span role={isValidating ? 'status' : undefined} aria-live={isValidating ? 'polite' : undefined}>{label}</span>
        {isValidating ? null : (
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
            <path d="M5 11l6-6M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {isValidating && <div className="upload-progress" aria-hidden="true"><span /></div>}
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="visually-hidden"
        onChange={handleChange}
        disabled={isValidating}
        aria-label="choose scenario json file"
      />
    </div>
  )
}

export default ScenarioUpload
