# LABYRINTH

**Adaptive experimental navigation for evidence-driven drug repurposing**

LABYRINTH is an interactive research-planning system designed to help scientists decide **what experiment matters next** during drug-repurposing programs.

Rather than treating experimental planning as a fixed checklist, LABYRINTH represents a scientific program as an evidence graph, updates that graph as experimental results arrive, and continuously reranks eligible experiments according to their expected value for reaching a decision.

The product combines a **deterministic planning engine**, an interactive evidence-map interface, and an **LLM explanation layer**. The deterministic planner remains the source of truth for experiment ranking and decision logic; the LLM explains the planner's recommendation in scientist-facing language without choosing or reranking experiments.

---

## Motivation

Drug-repurposing programs rarely proceed as a simple linear sequence of experiments. A candidate can have several plausible mechanisms, uncertain translational evidence, safety constraints, and multiple experimental routes toward a final development decision.

This creates several practical questions:

- Which unresolved hypothesis matters most right now?
- Which experiment is worth running next?
- Which evidence is required for a final decision, and which evidence is optional or redundant?
- How should the experimental plan change when an experiment succeeds, fails, or is inconclusive?
- How can a scientist understand **why** the planner prefers one experiment over another?
- How can historical programs be replayed without leaking known outcomes into the planning algorithm?

LABYRINTH was built to explore these questions through an adaptive, evidence-driven planning workflow.

Instead of asking researchers to complete every possible experiment, the long-term goal is to identify the **minimum useful evidence path toward a scientifically justified decision**, while retaining alternative branches when the evidence changes.

---

## Product Description

LABYRINTH models a research program as a directed evidence graph.

### Nodes

Each node represents a scientific hypothesis, evidence gate, translational requirement, safety requirement, or final decision.

Nodes can contain information such as:

- Status (`supported`, `uncertain`, `contradicted`, or `unexplored`)
- Confidence
- Prerequisite nodes
- Dependency logic
- Downstream nodes
- Failure scope

Dependency logic represents different scientific structures.

For example:

- `all` means all required prerequisite gates must be supported.
- `any` means at least one prerequisite path can be sufficient.

This allows LABYRINTH to represent both mandatory evidence gates and alternative mechanistic routes.

### Experiments

Experiments test specific nodes and contain planner-relevant attributes such as:

- Discriminating power
- Cost
- Time
- Positive action
- Negative action
- Negative scope
- Inconclusive-result behavior

Depending on the scenario and result, an experiment can:

- Advance evidence
- Prune a branch
- Trigger restrictions
- Reprioritize a hypothesis
- Request more evidence
- Require confirmation
- Terminate a candidate

### Adaptive Planning Loop

A typical LABYRINTH session follows this loop:

1. Load a research scenario.
2. Evaluate the current evidence graph.
3. Determine which experiments are currently eligible and decision-relevant.
4. Rank those experiments.
5. Recommend the next experiment.
6. Explain why that experiment was selected.
7. Record or reveal an experimental result.
8. Update the evidence graph.
9. Recalculate experiment eligibility and rankings.
10. Repeat until a final decision or another terminal planner state is reached.

The interface visualizes this process as a living evidence map rather than a static experiment checklist.

---

## Product Features

### Interactive Evidence Map

LABYRINTH renders scientific hypotheses and dependencies as an interactive graph.

Researchers can inspect individual nodes and view:

- Evidence status
- Confidence
- Scientific question
- Dependencies
- Downstream relationships
- Candidate experiments

Graph arrows represent **evidence and dependency relationships between scientific nodes**. They do **not necessarily represent the chronological order in which experiments should be performed**.

---

### Next Best Experiment

The deterministic planner ranks currently eligible experiments and identifies the highest-ranked experiment as the recommended next action.

The frontend presents this as the user's **Next Best Experiment** or **Next Quest**.

---

### Adaptive Reranking

After each experimental result, LABYRINTH updates the scientific state and reruns the planner.

A result can therefore change:

- Node status
- Node confidence
- Experiment eligibility
- Useful downstream experiments
- The recommended next experiment
- Final-decision reachability
- Restrictions
- Repeat requirements
- The eventual decision path

The experimental strategy is therefore adaptive rather than predetermined.

---

### Historical Evidence Replay

Historical-replay scenarios allow LABYRINTH to plan without seeing hidden known outcomes.

Only after the planner selects an experiment is the corresponding historical evidence revealed and applied.

This provides a way to evaluate whether the planner can navigate a known research program without leaking future information into its recommendations.

---

### Prospective Outcome Exploration

For non-historical scenarios, users can submit prospective or simulated outcomes:

- `positive`
- `negative`
- `inconclusive`

Users can also specify evidence quality:

- `pass`
- `questionable`
- `fail`

The planner then determines whether the scientific state should update or whether confirmation, repetition, troubleshooting, or additional evidence is required.

---

### QC-Aware Evidence Handling

LABYRINTH distinguishes experimental outcome from evidence quality.

Questionable or failed QC does not automatically change the scientific graph.

This allows the planner to represent workflows such as:

- Repeat / confirm
- Repeat / troubleshoot
- Confirmed failure after repeated trustworthy evidence

---

### Final-Decision Logic

Final-decision nodes evaluate their configured dependencies and can produce planner states such as:

- `GO`
- `MORE EVIDENCE`
- Candidate-level `NO-GO` through terminating failure logic

The planner can also identify situations where no useful experiments remain or where required evidence has become unreachable.

---

### LLM Recommendation Explanations

LABYRINTH includes a Groq/Qwen-powered explanation layer.

Importantly, the LLM **does not make the planning decision**.

The workflow is:

```text
Deterministic planner
        ↓
Experiment recommendation
        ↓
Grounded planner context
        ↓
LLM explanation
        ↓
Scientist-facing "Why this experiment?" explanation
```

The deterministic planner selects the experiment first. The LLM receives a constrained representation of that planner output and translates it into a concise explanation.

If the external LLM is unavailable, LABYRINTH falls back to a deterministic explanation so that the core planner remains usable.

---

### Scenario Upload and Validation

The frontend supports:

- Built-in research scenarios
- JSON scenario upload
- Scenario validation
- Uploaded scenario preview

This allows LABYRINTH to eventually support additional drug-repurposing and experimental-planning programs.

---

### Interactive Research Interface

The frontend includes:

- Responsive layouts
- Interactive node inspection
- Animated evidence-state changes
- Reduced-motion accessibility support
- Dynamic biological and maze-inspired visual environments
- Session-aware recommendation updates
- Evidence-state visualization
- Recommendation explanations

---

## Planner Calculations

LABYRINTH uses deterministic calculations to prioritize experiments.

These calculations are intended to make experiment selection traceable rather than delegating experimental planning to an LLM.

### 1. Uncertainty

For a node with confidence \(c\):

```text
uncertainty = 1 - confidence
```

For example, a node with confidence:

```text
0.35
```

has uncertainty:

```text
1 - 0.35 = 0.65
```

Lower-confidence unresolved nodes therefore have greater uncertainty.

---

### 2. Downstream Impact

The planner measures how many downstream descendants can be reached from a node:

```text
downstream impact =
max(number of downstream descendants, 1)
```

This metric represents the structural reach of the node within the evidence graph.

---

### 3. Marginal Decision Impact

LABYRINTH estimates how differently the research program would evolve under hypothetical **positive** versus **negative** outcomes for an experiment.

For each hypothetical outcome, the planner simulates the resulting program state.

It then compares:

1. Node reachability
2. Useful experiment eligibility
3. Final-decision reachability

The current marginal decision-impact calculation is:

```text
marginal decision impact =
(
    node reachability difference
    + useful experiment difference
    + final decision difference
) / 3
```

The tested node itself is excluded from the adjusted node-reachability component so that an experiment does not receive decision-impact credit simply because it changes the node it directly tests.

---

### 4. Experiment Score

For an eligible experiment, the current planner score is:

```text
score =
(
    uncertainty
    × marginal decision impact
    × discriminating power
)
/
(
    cost
    × time
)
```

Conceptually, this rewards experiments that:

- Address uncertainty
- Meaningfully change downstream decisions
- Have strong discriminating power

while penalizing experiments that require greater:

- Cost
- Time

The score is a **planner prioritization heuristic**.

It should not be interpreted as:

- A biological probability
- A clinical effect size
- A probability of drug success
- A universal measure of experimental value

---

### 5. Decision-Path Roles

The planner can classify experiments according to their relationship to the current decision problem.

Current roles include:

```text
blocking_required_experiment
direct_final_decision_prerequisite
required_path_prerequisite
optional_redundant
```

These roles help distinguish experiments that are necessary to make progress from experiments that may remain scientifically interesting but are not currently required for the decision.

---

### 6. Experiment Eligibility and Reachability

Experiment ranking is not based on numerical score alone.

Before scoring, the planner checks whether an experiment:

- Is currently eligible under the node's dependency logic
- Tests an unresolved node
- Has not already been completed when applicable
- Can still contribute to a viable route toward the final decision

This prevents a high numerical score from automatically overriding scientific graph constraints.

---

## Results

The current LABYRINTH implementation demonstrates an end-to-end adaptive experimental-planning workflow across built-in drug-repurposing scenarios.

The system can currently:

- Create stateful research sessions
- Rank eligible experiments
- Recommend a next experiment
- Update node confidence and status after evidence is entered
- Rerank experiments after each update
- Replay hidden historical evidence
- Distinguish experimental result from QC quality
- Request repeats or confirmation when appropriate
- Represent restrictions and candidate-level failure actions
- Surface final-decision states
- Generate grounded natural-language explanations of planner recommendations

The Propranolol historical-replay scenario, for example, demonstrates a graph containing:

- Competing mechanistic hypotheses
- Downstream biological evidence
- In-vivo evidence
- Safety considerations
- A final clinical-viability decision

The planner uses experimental outcomes to update this graph and adapt subsequent recommendations.

LABYRINTH should currently be considered a **research prototype**, not a validated autonomous drug-development decision system.

Formal benchmarking of recommendation quality, decision efficiency, robustness, and generalization across research programs remains future work.

---

## System Architecture

At a high level:

```text
Research Scenario
       │
       ▼
Deterministic Planner
       │
       ├──────────────► Evidence Graph / Planner State
       │
       ├──────────────► Ranked Experiments
       │
       └──────────────► Next Recommendation
                               │
                               ▼
                        LLM Explanation
                        (explanation only)
                               │
                               ▼
                          React Interface
                               │
                               ▼
                       Experimental Outcome
                               │
                               ▼
                       Planner Recalculates
```

The deterministic planner remains the source of truth throughout this loop.

---

## Future Directions

### Current Projected Path / Current Strategy

A major planned feature is an explicit **Current Projected Path**.

This represents the planner's current preferred route through the evidence graph toward a final decision.

It is distinct from the Next Best Experiment:

- **Next Best Experiment** = what should be tested next.
- **Current Projected Path** = the currently preferred evidence route toward the final decision.

For example:

```text
Clinical Treatment Signal
        ↓
Beta-Independent Activity
        ↓
Disease-Relevant Cellular Effect
        ↓
In-Vivo Disease-Relevant Effect
        ↓
Clinical Viability
```

If new evidence weakens that route, the planner may instead identify:

```text
Clinical Treatment Signal
        ↓
VEGF / Anti-Angiogenic Mechanism
        ↓
Disease-Relevant Cellular Effect
        ↓
In-Vivo Disease-Relevant Effect
        ↓
Clinical Viability
```

The projected path should therefore be recalculated after each result so researchers can see how the overall experimental strategy changes as evidence accumulates.

Importantly, the projected path should be calculated by the **backend planner**, not inferred by the frontend.

---

### Better Handling of Alternative and Redundant Branches

Future planner development should more explicitly stop unnecessary exploration once sufficient evidence has established a viable route through `any` dependencies.

The system should distinguish between:

- Required evidence
- Preferred evidence
- Alternative viable branches
- Optional/redundant experiments
- Blocked experiments
- Branches made irrelevant by accumulated evidence

This would move LABYRINTH closer to its goal of identifying the **smallest useful evidence set required for a decision** rather than resolving every possible hypothesis.

---

### Formal Planner Evaluation

Future work should benchmark LABYRINTH using metrics such as:

- Number of experiments required to reach a correct decision
- Cumulative experimental cost
- Cumulative experimental time
- Regret relative to an oracle or known optimal strategy
- Sensitivity to initial confidence assumptions
- Robustness to noisy or inconclusive evidence
- Frequency of unnecessary experiments
- Ability to recover after misleading evidence
- Agreement with expert experimental plans

Historical drug-development programs could provide retrospective evaluation cases.

---

### More Realistic Cost and Time Models

Current cost and time values are scenario-level planner inputs.

Future versions could incorporate:

- Monetary cost estimates
- Assay-duration distributions
- Parallelizable experiments
- Laboratory resource constraints
- Laboratory capacity
- Sample availability
- Expected failure rates
- Expected repeat rates

This could turn the planner into a richer experimental portfolio optimizer.

---

### Probabilistic Evidence Updates

Current confidence updates include heuristic state transitions.

Future work could incorporate more formal probabilistic approaches such as:

- Bayesian updating
- Calibrated likelihood models
- Uncertainty distributions
- Evidence-strength weighting
- Assay-specific reliability models

---

### Expanded QC and Replication Modeling

Replication logic could be extended to model:

- Conflicting replicates
- Assay-specific QC thresholds
- Independent confirmation requirements
- Batch effects
- Evidence provenance
- Confidence accumulation across studies

---

### Richer Decision Semantics

Future decision states could extend beyond basic GO / NO-GO / MORE EVIDENCE to represent:

- Restricted development
- Subgroup-specific development
- Dose or regimen modification
- Mechanism pivot
- Indication pivot
- Additional translational validation
- Conditional advancement

---

### Broader Applications

Although LABYRINTH is currently framed around adaptive drug-repurposing research, the underlying approach could be applied to other sequential evidence-generation problems, including:

- Target validation
- Mechanism-of-action studies
- Biomarker development
- Indication selection
- Preclinical development
- Translational medicine
- Clinical development strategy
- Safety de-risking
- Experimental troubleshooting
- Scientific hypothesis prioritization

Any domain in which evidence forms a dependency graph and experiments have different costs, information value, and downstream consequences could potentially use a similar planning framework.

---

### Persistent and Collaborative Research Programs

Future versions could add:

- Persistent sessions
- Authentication
- Shared team workspaces
- Experiment history
- Researcher annotations
- Decision audit trails
- Versioned scenarios
- Collaborative review
- Exportable research reports

---

### Explainability and Provenance

Future explanation features could expose not only **why an experiment was selected**, but also:

- Which evidence made it eligible
- Which alternatives were considered
- Why alternatives ranked lower
- What result would most change the plan
- Which final-decision gate the experiment helps resolve
- Which planner facts support each explanation

This would improve scientific auditability while preserving the separation between deterministic planning and natural-language explanation.

---

## Project Status

LABYRINTH is under active development.

Current development priorities include:

- Improving decision-path behavior
- Exposing an authoritative projected path from the backend
- Refining adaptive experiment stopping logic
- Expanding scenario coverage
- Formal planner evaluation
- Continuing to improve the research-workspace interaction design

---

## Disclaimer

LABYRINTH is a research and software prototype.

It is not a medical device and should not be used as a substitute for scientific, clinical, regulatory, or drug-development judgment.
