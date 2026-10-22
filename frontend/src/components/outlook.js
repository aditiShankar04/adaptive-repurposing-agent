// One-line summary of planner.decision_outlook, worded from the backend state only.
export function outlookHeadline(outlook) {
  if (!outlook) return null
  if (outlook.state === 'final_decision_reached') return `final decision: ${outlook.final_decision}`
  if (outlook.state === 'no_go') return 'final decision: NO-GO'
  if (outlook.state === 'dead_end_more_evidence') return 'more evidence / new path required'
  return 'more evidence required'
}
