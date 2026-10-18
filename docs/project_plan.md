# Adaptive Experimental Design for Drug Repurposing

## Project Goal

Build a prototype **adaptive experimental-design system for drug
repurposing**. Instead of another model that only predicts which drugs
could be repurposed, our system focuses on what happens **after a
promising drug-disease hypothesis is generated**.

Starting from a proposed drug-disease pairing, the system maps possible
validation paths, reasons about downstream consequences, identifies the
most important uncertainty, recommends the next experiment, validates
the resulting data, and updates the decision tree.

The long-term vision is a **video game-style drug-development decision
tree** where researchers can explore alternative paths before committing
expensive experimental resources.

------------------------------------------------------------------------

## 1. Start With RepurAgent / Drug Repurposing Output

Use **RepurAgent as the starting point or baseline** rather than
rebuilding the initial drug-repurposing pipeline.

Inputs to our system: - Proposed drug → disease pairing - Proposed
mechanism(s) of action - Supporting and contradicting evidence -
Predicted efficacy, ADMET, safety, etc. - Drug-target-pathway
relationships - Existing experimental data

### MVP Fallback

If direct RepurAgent integration becomes too difficult, define a
standardized JSON/input format representing what RepurAgent would have
produced. This lets us demonstrate our experimental-decision layer
independently.

------------------------------------------------------------------------

## 2. Construct a Drug Validation Decision Tree

Transform the repurposing hypothesis into a graph of questions that must
be answered before the candidate should advance.

``` text
Drug X → Disease Y
        |
Mechanism valid?
   /         \
Target?   Alternative mechanism?
   |
Efficacy?
   |
Clinically achievable exposure?
   |
Safety?
   |
GO / NO-GO
```

Each node can store: - Question being tested - Status: supported /
uncertain / contradicted / unexplored - Confidence - Supporting and
contradicting evidence - Dependencies - Possible experiments -
Approximate cost and time - Acceptance threshold, if applicable

The graph becomes the **shared state of the research program**.

------------------------------------------------------------------------

## 3. Maintain a Coupling / Dependency Map

Represent how upstream properties and decisions influence downstream
endpoints.

``` text
Molecular properties
        ↓
Target engagement
        ↓
Efficacy
        ↓
Required dose
        ↓
Exposure / PK
        ↓
Toxicity
        ↓
Clinical viability
```

Example couplings: - Lipophilicity → clearance - Hydrophobicity →
formulation / viscosity - Potency → required dose → toxicity - Target
engagement → efficacy - Metabolism → exposure → dosing - Solubility →
formulation → bioavailability

The MVP does **not** need to perfectly simulate years of development. We
need enough structure for the agent to reason about how an early
decision could affect later stages.

Core question: **If we make this decision now, what downstream problems
could it create or resolve?**

------------------------------------------------------------------------

## 4. Generate Alternative Development Paths

For each important uncertainty or decision, generate multiple possible
paths.

``` text
CURRENT STATE
     |
-------------------------
|           |           |
Mechanism A Mechanism B Mechanism C
|           |           |
Experiment A Experiment B Experiment C
|           |           |
Outcome?    Outcome?    Outcome?
```

For each path, ask: - What happens if the hypothesis is correct? - What
happens if it is incorrect? - Which downstream endpoints depend on it? -
Which future paths become impossible? - Which remain viable? - What
uncertainty prevents us from choosing between paths?

This is the **counterfactual reasoning component**.

------------------------------------------------------------------------

## 5. Select the Next Best Experiment

Generate possible experiments for unresolved nodes and score them.

For the MVP:

``` text
Experiment Value =
(Uncertainty × Downstream Impact × Ability to Distinguish Paths)
----------------------------------------------------------------
                         Cost × Time
```

Prioritize experiments that: - Resolve major uncertainty - Distinguish
competing mechanisms or paths - Eliminate bad paths early - Affect many
downstream decisions - Are relatively cheap and fast - Could
substantially change a GO/NO-GO decision

Example:

``` text
RECOMMENDED NEXT EXPERIMENT

Experiment: Target engagement assay

Why: Target engagement is uncertain and determines whether
three downstream efficacy paths remain viable.

Expected information value: High
Estimated cost: $$
Estimated time: 1 day

Impact: A negative result could eliminate the primary mechanism
before more expensive efficacy experiments are performed.
```

This is the core **adaptive experimental-design agent**.

------------------------------------------------------------------------

## 6. Run or Ingest the Experimental Result

For the hackathon, we do **not** need to physically perform experiments.

The MVP can use: - Historical/public experimental results - Simulated
results - User-entered results - Positive / negative / inconclusive
outcomes

Future versions could connect to automated laboratories, CROs, or
robotic systems.

------------------------------------------------------------------------

## 7. Validate Experimental Data Before Learning From It

Before changing the scientific model, determine whether new evidence is
trustworthy.

Basic MVP QC: - Missing values - Replicate agreement - Outliers -
Control performance - Unexpected variance - Dose-response consistency -
Assay drift - Consistency with previous state

Possible outputs:

``` text
PASS → update scientific model

QUESTIONABLE → reduce evidence weight or request validation

FAIL → do not update model; repeat/troubleshoot experiment
```

This prevents the autonomous system from blindly learning from bad
experimental results.

------------------------------------------------------------------------

## 8. Update and Prune the Decision Tree

After a valid result:

1.  Update confidence in the affected hypothesis.
2.  Propagate the result to dependent downstream nodes.
3.  Remove/deprioritize implausible paths.
4.  Recalculate uncertainty.
5.  Identify the new critical uncertainty.
6.  Generate candidate experiments.
7.  Select the next highest-value experiment.

``` text
Hypothesis
    ↓
Identify uncertainty
    ↓
Choose experiment
    ↓
Run experiment
    ↓
Validate data
    ↓
Update beliefs
    ↓
Prune paths
    ↓
Choose next experiment
    └──────────────→ Repeat
```

------------------------------------------------------------------------

## 9. Add Human Gates

Important actions can require human approval.

``` text
AGENT RECOMMENDATION

Run Experiment B.

Reason:
Experiment B could eliminate three downstream paths
at relatively low experimental cost.

[Approve] [Reject] [Modify] [Explore Alternative]
```

This creates a realistic human-AI workflow while still demonstrating
increasing experimental autonomy.

------------------------------------------------------------------------

## 10. Video Game-Style Interface

Represent the repurposing program as an interactive **decision tree /
technology tree**.

Node states: - **Green:** Supported - **Yellow:** Uncertain - **Red:**
Failed / contradicted - **Gray:** Unexplored

Clicking a node can show: - Current evidence - Confidence - Why it
matters downstream - Available experiments - Cost/time - Predicted
information value - What happens under positive/negative results

A **"What If?"** mode lets the user explore an alternative decision
without changing the real program state.

------------------------------------------------------------------------

# MVP: What We Actually Need to Build in 4 Days

The minimum successful demo is:

``` text
Repurposing hypothesis
        ↓
Mechanism + evidence
        ↓
Small decision tree
        ↓
Identify uncertainty
        ↓
Recommend next experiment
        ↓
Receive simulated/historical result
        ↓
Basic QC
        ↓
Update/prune tree
        ↓
Recommend experiment #2
        ↓
GO / NO-GO / MORE EVIDENCE
```

## MVP Requirements

1.  **One drug-repurposing scenario** --- one convincing case is enough
    for the live demo.
2.  **Small endpoint graph** --- approximately 5--10 nodes: mechanism →
    target engagement → efficacy → exposure → safety → viability.
3.  **Experimental-design agent** --- selects the next experiment and
    explains why.
4.  **Simple experiment scoring** --- uncertainty + downstream impact +
    discriminating power + cost/time.
5.  **Result ingestion** --- positive / negative / inconclusive or one
    simple dataset.
6.  **Basic data validation** --- questionable data should not
    automatically update the model.
7.  **Adaptive update** --- new evidence changes the graph and next
    recommendation.
8.  **Interactive decision-tree UI** --- supported, uncertain,
    falsified, and unexplored paths.
9.  **Final decision** --- GO / NO-GO / MORE EVIDENCE.

------------------------------------------------------------------------

# If We Have Extra Time

-   Direct RepurAgent integration
-   Multiple repurposing candidates
-   More sophisticated information-gain calculations
-   Better uncertainty calibration
-   Historical experimental datasets
-   Multiple experiment types
-   Counterfactual replay of previous decisions
-   Cost/time simulation
-   Comparison against a fixed experimental pipeline

------------------------------------------------------------------------

# Evaluation

Evaluate **decision quality**, not only prediction accuracy.

Compare: 1. Fixed validation pipeline 2. Basic LLM experiment selection
3. Our adaptive experimental-design system

Possible metrics: - Experiments until correct GO/NO-GO - Total simulated
experimental cost - Unnecessary experiments - Dead-end paths explored -
Correct final decision - Confidence calibration

Longer-term, log predicted downstream effects and compare them with
eventual outcomes to measure **calibration for each coupling in the
graph**.

------------------------------------------------------------------------

# Four-Day Build Plan

## Day 1: Make the Loop Work

Goal:

``` text
Drug/Disease → Tree → Recommended Experiment → Result → Updated Tree
```

Tasks: - Pick one repurposing case. - Test RepurAgent integration. -
Define standardized RepurAgent output. - Build the first 5--10 node
tree. - Implement simple experiment-selection logic. - Allow a simulated
result to update the graph.

**End-of-day requirement:** one complete loop works, even if partially
hard-coded.

## Day 2: Add Scientific Reasoning

Add: - Mechanistic evidence - Uncertainty scores - Dependency/coupling
relationships - Multiple experiment options - Cost/time estimates -
Basic QC - Repeated experimental loop

## Day 3: Evaluation

Create several hidden or simulated scenarios and compare: - Fixed
experimental order - LLM-selected experiments - Our adaptive planner

Measure experiments required, simulated cost, correct GO/NO-GO, and
dead-end experiments avoided.

## Day 4: UI + Demo + Presentation

Focus on: - Video game-style decision tree - Clear node colors/status -
"What If?" exploration - Experiment recommendation panel - Visual tree
updates - Presentation slides - Rehearsing the live demo

**Stop adding major backend features on Day 4.**

------------------------------------------------------------------------

# Scope Guardrails

## Must Have

-   Drug → disease hypothesis
-   Small mechanistic decision tree
-   Explicit uncertainty
-   Next experiment recommendation
-   Result ingestion
-   Tree update/pruning
-   Repeated loop
-   GO / NO-GO / MORE EVIDENCE

## Should Have

-   Experiment cost/time
-   Simple data QC
-   Real repurposing example
-   Baseline comparison

## Nice to Have

-   Full RepurAgent integration
-   Bayesian/information-gain methods
-   Multiple repurposing candidates
-   Historical replay

## Do Not Build for the Hackathon

-   Physical lab integration
-   Robotics
-   Full PK/PD simulation
-   Molecular dynamics
-   Universal assay QC
-   New biological foundation models
-   Full clinical-development simulation
-   Huge multi-agent architecture

------------------------------------------------------------------------

# One-Sentence Project Definition

> **We extend an existing drug-repurposing workflow with a
> counterfactual, adaptive experimental-design layer that maps possible
> development paths, identifies which uncertainty matters most
> downstream, selects the highest-value experiment to resolve it,
> validates the resulting data, and continuously updates the path toward
> a GO/NO-GO decision.**

------------------------------------------------------------------------

# What We Are Not Building

-   **Not:** another drug-repurposing prediction model.
-   **Not:** a replacement for RepurAgent.
-   **Not:** a physical autonomous lab.
-   **Not:** a perfect digital twin of drug development.

**We are building the decision layer between computational
drug-repurposing hypotheses and expensive experimental validation.**
