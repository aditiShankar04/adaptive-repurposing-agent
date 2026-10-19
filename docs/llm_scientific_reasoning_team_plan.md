# LLM Scientific Reasoning Layer --- Team Plan

## Goal

Build a **provider-agnostic LLM scientific reasoning layer** around the
adaptive experimental planner.

The LLM should not replace the deterministic planner or simply choose
the next experiment.

``` text
Scientific evidence / current state
            ↓
      LLM reasoning layer
            ↓
    Structured scientific output
            ↓
    Deterministic planner
            ↓
dependencies + path viability
+ decision impact + cost/time
            ↓
    Recommended experiment
```

The deterministic planner remains the auditable decision engine. The LLM
adds scientific interpretation, explanation, and eventually hypothesis
generation.

## Model-Access Constraint

Do **not** assume access to paid OpenAI API credits or any particular
commercial model.

The team currently has a **UCSF Versa API key** and has previously used
models such as **Qwen**. Build the layer so the provider/model can be
swapped.

``` text
             LLMReasoner
                 |
       +---------+---------+
       |         |         |
     Versa      Qwen     OpenAI
       |                    |
       +---------+----------+
                 |
              Mock mode
```

The rest of the application should receive the same structured output
regardless of provider.

## Person Responsible

**LLM / Scientific Reasoning Person**

Suggested branch:

``` bash
git checkout -b feature/llm-reasoning
```

Pull latest changes before starting:

``` bash
git pull origin main
```

Do not modify `backend/experiment_selector.py` during the initial
architecture/prototype work unless coordinated with the backend owner.

------------------------------------------------------------------------

# Step 1 --- Inspect the Existing System

Review:

-   `backend/experiment_selector.py`
-   `data/propranolol-scenario.json`
-   `data/xanomeline-pdp-scenario.json`

The deterministic backend already handles or is actively implementing:

-   Scenario selection
-   Scientific dependency graphs
-   `all` / `any` / `none` dependencies
-   Experiment eligibility
-   Path viability / dead-end detection
-   Uncertainty
-   Cost/time
-   Discriminating power
-   Marginal decision-impact scoring
-   Hypothetical outcome simulation
-   Multi-round adaptive replanning
-   Final GO evaluation

Do not duplicate this functionality in the LLM.

# Step 2 --- Decide What the LLM Receives

Potential input:

``` json
{
  "drug": "...",
  "disease": "...",
  "goal": "...",
  "current_nodes": [],
  "relevant_evidence": {},
  "available_experiments": [],
  "planner_recommendation": {},
  "recent_result": null
}
```

Useful context may include:

-   Drug/disease
-   Scientific goal
-   Relevant node questions
-   Node status/confidence
-   Supporting evidence
-   Contradicting evidence
-   Evidence gaps
-   Dependencies
-   Eligible experiments
-   Planner recommendation
-   Planner metrics
-   Most recent experimental result

Avoid sending unnecessary repository/literature content in every
request.

# Step 3 --- Define the LLM's Responsibilities

### A. Summarize the scientific state

Example:

> M1 activity is supported while M4 remains uncertain. This keeps the
> brain-exposure route viable, but central receptor occupancy in a
> Parkinsonian setting remains unresolved.

### B. Identify the key uncertainty

Example:

> The major translational uncertainty is whether a tolerable dose
> produces sufficient central receptor occupancy in the disease-relevant
> setting.

### C. Explain the planner's recommendation

The deterministic planner might output:

``` text
Brain Exposure / Receptor Occupancy
Decision impact: high
Cost: 4
Time: 3
```

The LLM turns this into a scientist-readable explanation of why that
experiment matters.

### D. Interpret experimental evidence

Eventually explain:

-   What a result means scientifically
-   Which hypotheses it supports/weakens
-   Alternative explanations
-   Whether confirmation may be needed

### E. Identify alternative hypotheses

Useful when one mechanism weakens but another remains plausible.

### F. Propose new experiments when the graph reaches a dead end

This is a later/stretch capability. Suggestions are proposals requiring
human/deterministic validation.

# Step 4 --- What the LLM Should NOT Control

Keep deterministic:

-   Experiment scoring
-   Cost/time arithmetic
-   Dependency enforcement
-   `all` / `any` / `none` logic
-   Path viability
-   Eligibility
-   Marginal decision-impact calculation
-   Automatic GO/NO-GO
-   Candidate kill decisions
-   Direct graph/state mutation

The LLM should not silently change confidence, status, dependencies,
cost, time, or final decisions.

# Step 5 --- Define Strict Structured Output

Suggested MVP schema:

``` json
{
  "scientific_summary": "string",
  "key_uncertainty": "string",
  "recommendation_explanation": "string",
  "affected_nodes": ["node_id"],
  "alternative_explanations": ["string"],
  "evidence_gaps": ["string"],
  "suggested_followups": [
    {
      "name": "string",
      "reason": "string"
    }
  ],
  "warnings": ["string"]
}
```

Validate the returned structure before displaying/using it.

# Step 6 --- Build a Provider-Agnostic Interface

Suggested location:

``` text
backend/llm_reasoner.py
```

Potential structure:

``` text
backend/
    experiment_selector.py
    llm_reasoner.py
    llm_providers/
        mock_provider.py
        versa_provider.py
        qwen_provider.py
        openai_provider.py   # optional/future
```

Keep this smaller if needed for the hackathon.

The key requirement is that provider-specific API code stays isolated.

# Step 7 --- Start With Mock Mode

Support something like:

``` text
LLM_PROVIDER=mock
```

Mock mode lets the team build the integration and frontend without any
API credits.

Do not present mocked responses as live LLM output.

# Step 8 --- Investigate UCSF Versa First

Because the team already has Versa access, determine:

1.  Authentication method
2.  Models available through your access
3.  Whether Qwen or another suitable model is exposed
4.  Structured/JSON-output support
5.  Rate limits
6.  Context limits
7.  Whether it works from the hackathon environment
8.  Relevant UCSF usage/policy constraints

Never commit API keys.

Use environment variables, e.g.:

``` text
VERSA_API_KEY=...
```

The app should fail gracefully if no key exists.

# Step 9 --- Qwen Is a Valid Option

If Qwen is available through Versa or another environment the team
already has, it is reasonable for the hackathon.

Example configuration:

``` text
LLM_PROVIDER=versa
LLM_MODEL=<available-model>
```

or:

``` text
LLM_PROVIDER=qwen
LLM_MODEL=<available-qwen-model>
```

Do not architect around one model name. The structured reasoning
contract matters more than the provider/model brand.

# Step 10 --- OpenAI Is Optional

If sponsored credits/API access become available later, add an OpenAI
provider behind the same interface.

OpenAI access should not be required for the MVP.

# Step 11 --- First MVP Feature: "Why This Experiment?"

Start here rather than autonomous experiment generation.

``` text
Current state
    ↓
Deterministic planner
    ↓
Recommended experiment
    ↓
LLM receives relevant context
    ↓
Scientific explanation
    ↓
Frontend displays:
"Why this experiment?"
```

Example:

``` text
NEXT BEST EXPERIMENT
Brain Exposure / Receptor Occupancy

Planner:
High marginal decision impact.

LLM:
M1 activity is currently supported, but downstream efficacy
and motor-safety studies would be difficult to interpret
without confirming that a tolerable dose achieves meaningful
central receptor occupancy in a Parkinsonian setting.
```

# Step 12 --- Test With Propranolol

Historical replay:

``` text
Planner selects experiment
    ↓
LLM explains scientific importance
    ↓
Historical result revealed
    ↓
Graph updates
    ↓
LLM summarizes what was learned
```

The LLM must not see hidden historical results before they are revealed.

# Step 13 --- Test With Xanomeline

Prospective exploration:

``` text
Current evidence
    ↓
Planner recommends next experiment
    ↓
LLM explains why
    ↓
WHAT IF POSITIVE / WHAT IF NEGATIVE
    ↓
LLM explains scientific meaning
```

All future branches must be explicitly labeled hypothetical.

# Step 14 --- Later: Experimental Result Interpretation

Potential flow:

``` text
Experimental result/data
    ↓
LLM interpretation
    ↓
Structured output
    ↓
Deterministic validation / QC
    ↓
State update
```

Example output:

``` json
{
  "interpretation": "...",
  "supports": ["m1_branch"],
  "weakens": ["m4_branch"],
  "alternative_explanations": [],
  "needs_confirmation": true
}
```

Do not let the LLM directly update state by itself.

# Step 15 --- Later: New Hypothesis / Experiment Proposal

If the planner reaches:

``` text
DEAD END / MORE EVIDENCE
```

the LLM can suggest alternative mechanisms or experiments.

These suggestions require human/deterministic validation before entering
the graph.

# Step 16 --- Reliability Guardrails

1.  Validate structured output.
2.  Ground prompts in scenario evidence.
3.  Separate known evidence from inference/hypothesis.
4.  No silent graph edits.
5.  No fabricated citations.
6.  Keep prospective What-If results explicitly hypothetical.
7.  If provider fails or returns invalid output, fall back gracefully.

# Step 17 --- Suggested System Prompt

``` text
You are the scientific reasoning layer of an adaptive
experimental-planning system.

Reason only from the supplied scenario state and evidence.

Your job is to:
- summarize the current scientific state,
- identify the key uncertainty,
- explain why the planner's selected experiment is informative,
- identify plausible alternative explanations,
- identify evidence gaps.

Do not:
- change experiment scores,
- invent experimental results,
- treat hypothetical outcomes as observed evidence,
- make final GO/NO-GO decisions,
- fabricate sources.

Return only the requested structured JSON.
```

# Step 18 --- Minimal Integration Contract

Input:

``` json
{
  "task": "explain_recommendation",
  "scenario": {
    "drug": "...",
    "disease": "...",
    "goal": "..."
  },
  "relevant_nodes": [],
  "relevant_evidence": {},
  "recommended_experiment": {},
  "planner_metrics": {}
}
```

Output:

``` json
{
  "scientific_summary": "...",
  "key_uncertainty": "...",
  "recommendation_explanation": "...",
  "alternative_explanations": [],
  "evidence_gaps": [],
  "warnings": []
}
```

Keep this contract consistent across Versa, Qwen, OpenAI, and mock
providers.

# Step 19 --- Evaluation

Evaluate whether the LLM:

-   Correctly references supplied state
-   Does not invent results
-   Distinguishes observed vs hypothetical evidence
-   Returns valid structured output
-   Gives coherent scientific explanations
-   Identifies relevant evidence gaps
-   Does not override deterministic constraints

A small manually reviewed test set across propranolol and xanomeline is
enough for the hackathon.

# Step 20 --- Demo Behavior

Ideal UI:

``` text
NEXT BEST EXPERIMENT

Brain Exposure / Receptor Occupancy

Decision impact: High
Cost: 4
Time: 3

WHY THIS EXPERIMENT?
[LLM scientific explanation]

Current key uncertainty:
Can a tolerable dose achieve meaningful central receptor
occupancy in a Parkinsonian setting?

Evidence gap:
No occupancy data currently exist in a parkinsonian brain.
```

The audience should understand:

``` text
LLM
= scientific interpretation / explanation

Deterministic planner
= auditable experiment selection
```

# What Not to Build for the Hackathon

Avoid:

-   Fine-tuning
-   RAG unless genuinely needed
-   Vector databases
-   Multi-agent orchestration
-   Autonomous literature-review pipelines
-   Large prompt chains
-   Broad model benchmarking
-   Automatic graph mutation without human validation

# Recommended Build Order

``` text
1. Inspect current backend/scenarios
2. Define LLM input/output contract
3. Build provider-agnostic reasoner interface
4. Implement mock provider
5. Investigate/connect UCSF Versa
6. Use an available model (Qwen or another Versa model)
7. Implement recommendation explanation
8. Test on propranolol
9. Test on xanomeline
10. Connect explanation to frontend
11. Then consider result interpretation
12. Then consider hypothesis/experiment proposals
```

# Definition of Done

-   [ ] LLM code isolated from `experiment_selector.py`
-   [ ] Provider can change without planner changes
-   [ ] Mock mode works without API access
-   [ ] Credentials use environment variables
-   [ ] No keys committed to Git
-   [ ] LLM receives relevant scenario context
-   [ ] LLM returns validated structured output
-   [ ] "Why this experiment?" works
-   [ ] Propranolol explanation is coherent
-   [ ] Xanomeline explanation clearly labels prospective uncertainty
-   [ ] Provider failure does not break deterministic planner
-   [ ] Frontend can display the explanation
-   [ ] LLM cannot override planner scores/constraints

# One-Sentence Architecture

> **The LLM acts as the scientific reasoning and interpretation layer,
> while the deterministic graph planner remains the auditable decision
> engine that chooses experiments based on dependencies, decision
> impact, uncertainty, cost, and time.**
