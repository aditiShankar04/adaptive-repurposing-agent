function StatusIcon({ status, size = 14 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    'aria-hidden': true,
    focusable: false,
    className: 'status-icon',
  }

  if (status === 'supported') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="M4.6 8.3l2.3 2.3 4.5-4.7" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (status === 'contradicted') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (status === 'uncertain') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 1.8a6.2 6.2 0 0 0 0 12.4z" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.6 2.4" />
    </svg>
  )
}

export default StatusIcon
