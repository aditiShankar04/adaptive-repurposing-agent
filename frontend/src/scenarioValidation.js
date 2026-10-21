const VALID_STATUSES = ['supported', 'uncertain', 'contradicted', 'unexplored']
const MAX_ERRORS_SHOWN = 6

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string')

function validateNodes(nodes, errors) {
  const ids = new Set()

  nodes.forEach((node, index) => {
    const label = isNonEmptyString(node?.id) ? `Node "${node.id}"` : `Node #${index + 1}`

    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      errors.push(`${label} must be an object`)
      return
    }

    if (!isNonEmptyString(node.id)) errors.push(`${label}: missing "id"`)
    else if (ids.has(node.id)) errors.push(`${label}: duplicate id`)
    else ids.add(node.id)

    if (!isNonEmptyString(node.name)) errors.push(`${label}: missing "name"`)

    if (!VALID_STATUSES.includes(node.status)) {
      errors.push(`${label}: "status" must be one of ${VALID_STATUSES.join(', ')}`)
    }

    if (!isFiniteNumber(node.confidence) || node.confidence < 0 || node.confidence > 1) {
      errors.push(`${label}: "confidence" must be a number between 0 and 1`)
    }

    if (!isStringArray(node.depends_on)) errors.push(`${label}: "depends_on" must be an array of node ids`)
    if (!isStringArray(node.downstream)) errors.push(`${label}: "downstream" must be an array of node ids`)
  })

  nodes.forEach((node) => {
    if (!node || !isNonEmptyString(node.id)) return

    ;['depends_on', 'downstream'].forEach((field) => {
      if (!isStringArray(node[field])) return
      node[field].forEach((targetId) => {
        if (!ids.has(targetId)) errors.push(`Node "${node.id}": "${field}" references unknown node "${targetId}"`)
      })
    })
  })

  return ids
}

function validateExperiments(experiments, nodeIds, errors) {
  const ids = new Set()

  experiments.forEach((experiment, index) => {
    const label = isNonEmptyString(experiment?.id) ? `Experiment "${experiment.id}"` : `Experiment #${index + 1}`

    if (experiment === null || typeof experiment !== 'object' || Array.isArray(experiment)) {
      errors.push(`${label} must be an object`)
      return
    }

    if (!isNonEmptyString(experiment.id)) errors.push(`${label}: missing "id"`)
    else if (ids.has(experiment.id)) errors.push(`${label}: duplicate id`)
    else ids.add(experiment.id)

    if (!isNonEmptyString(experiment.name)) errors.push(`${label}: missing "name"`)

    if (!isNonEmptyString(experiment.tests_node)) errors.push(`${label}: missing "tests_node"`)
    else if (!nodeIds.has(experiment.tests_node)) {
      errors.push(`${label}: "tests_node" references unknown node "${experiment.tests_node}"`)
    }

    if (!isFiniteNumber(experiment.cost) || experiment.cost <= 0) errors.push(`${label}: "cost" must be a number above 0`)
    if (!isFiniteNumber(experiment.time) || experiment.time <= 0) errors.push(`${label}: "time" must be a number above 0`)

    if (
      !isFiniteNumber(experiment.discriminating_power)
      || experiment.discriminating_power < 0
      || experiment.discriminating_power > 1
    ) {
      errors.push(`${label}: "discriminating_power" must be a number between 0 and 1`)
    }
  })
}

export function validateScenario(scenario) {
  const errors = []

  if (scenario === null || typeof scenario !== 'object' || Array.isArray(scenario)) {
    return { ok: false, errors: ['The file must contain a single JSON object.'], hiddenErrorCount: 0 }
  }

  if (!isNonEmptyString(scenario.drug)) errors.push('Missing required field: "drug"')
  if (!isNonEmptyString(scenario.disease)) errors.push('Missing required field: "disease"')

  if (!Array.isArray(scenario.nodes)) errors.push('Missing required field: "nodes" (must be an array)')
  else if (scenario.nodes.length === 0) errors.push('"nodes" must contain at least one node')

  if (!Array.isArray(scenario.experiments)) errors.push('Missing required field: "experiments" (must be an array)')

  if (Array.isArray(scenario.nodes) && scenario.nodes.length > 0 && Array.isArray(scenario.experiments)) {
    const nodeIds = validateNodes(scenario.nodes, errors)
    validateExperiments(scenario.experiments, nodeIds, errors)
  }

  if (errors.length > 0) {
    const uniqueErrors = [...new Set(errors)]
    return {
      ok: false,
      errors: uniqueErrors.slice(0, MAX_ERRORS_SHOWN),
      hiddenErrorCount: Math.max(0, uniqueErrors.length - MAX_ERRORS_SHOWN),
    }
  }

  return {
    ok: true,
    scenario,
    summary: {
      drug: scenario.drug,
      disease: scenario.disease,
      nodeCount: scenario.nodes.length,
      experimentCount: scenario.experiments.length,
    },
  }
}

export async function readScenarioFile(file) {
  if (!file.name.toLowerCase().endsWith('.json')) {
    return { ok: false, errors: ['Only .json files are supported.'], hiddenErrorCount: 0 }
  }

  let text
  try {
    text = await file.text()
  } catch {
    return { ok: false, errors: ['The file could not be read.'], hiddenErrorCount: 0 }
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['Invalid JSON syntax.'], hiddenErrorCount: 0 }
  }

  return validateScenario(parsed)
}
