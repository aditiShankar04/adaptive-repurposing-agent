"""Regression tests for the Labyrinth experiment planner.

Run from the repo root:  python -m pytest tests -v

Two kinds of test live here:
  * normal tests        - behavior we want to keep (they should pass today)
  * xfail(strict=True)  - known gaps. They fail today ON PURPOSE; once the
                          gap is fixed they flip to "XPASS" and strict mode
                          makes the run fail, reminding you to delete the
                          xfail marker.
"""
import json
import sys
from copy import deepcopy
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import experiment_selector as es  # noqa: E402

XANOMELINE = ROOT / "data" / "xanomeline-pdp-scenario.json"
DEMO = ROOT / "data" / "demo-scenario.json"

# Experiments whose negative result is `restrict` (safety / exposure questions)
SAFETY_ZERO_SCORE = {"exp_pk_modeling", "exp_herg", "exp_ddi"}
REDUNDANT_M4 = "exp_m4_potency"


# ---------------------------------------------------------------- helpers
def load(path):
    with open(path) as f:
        return json.load(f)


def new_session(path=XANOMELINE):
    return es.create_session_state("test", deepcopy(load(path)))


def planner_state(session):
    return es.get_session_planner_state(session)


def ranked_ids(state):
    return [r["experiment"]["id"] for r in state["ranked_experiments"]]


def role_of(state, experiment_id):
    for r in state["ranked_experiments"]:
        if r["experiment"]["id"] == experiment_id:
            return r["impact_details"]["decision_path_role"]
    return None


def score_of(state, experiment_id):
    for r in state["ranked_experiments"]:
        if r["experiment"]["id"] == experiment_id:
            return r["metrics"]["score"]
    return None


def run_to_end(session, results=None, max_steps=30):
    """Follow the planner's top recommendation until it stops recommending.

    results: {experiment_id: "positive" | "negative" | "inconclusive"}
             anything not listed is run as "positive".
    Returns the ordered list of experiment ids that were run.
    """
    results = results or {}
    executed = []
    for _ in range(max_steps):
        state = planner_state(session)
        if not state["recommendation"]:
            break
        exp_id = state["recommendation"]["experiment_id"]
        executed.append(exp_id)
        es.apply_experiment_result(session, exp_id, results.get(exp_id, "positive"), "pass")
    else:
        pytest.fail("planner never stopped recommending (possible infinite loop)")
    return executed


# ------------------------------------------------- the happy path / GO
def test_all_positive_run_reaches_go():
    session = new_session()
    run_to_end(session)
    state = planner_state(session)
    assert state["planner"]["status"] == "final_decision_reached"
    assert state["planner"]["final_decision"] == "GO"
    assert state["recommendation"] is None


def test_every_run_terminates_and_never_repeats_an_experiment():
    session = new_session()
    executed = run_to_end(session)
    assert len(executed) == len(set(executed)), "an experiment was recommended twice"


# ------------------------------------------- the structural fallback itself
def test_safety_checks_score_zero_but_are_still_recommendable():
    """The original problem: PK / hERG / DDI score 0, yet must not be ignored."""
    state = planner_state(new_session())
    ids = ranked_ids(state)
    for exp_id in SAFETY_ZERO_SCORE:
        assert score_of(state, exp_id) == 0, f"{exp_id} expected to score 0"
        assert exp_id in ids, f"{exp_id} dropped from ranking despite being required"
        assert role_of(state, exp_id) != "optional_redundant"


def test_redundant_m4_is_never_run_in_a_full_positive_run():
    """Once M1 supports the mechanism, M4 is redundant and should be skipped."""
    session = new_session()
    executed = run_to_end(session)
    assert REDUNDANT_M4 not in executed
    # ...and it still ended in GO without it
    assert planner_state(session)["planner"]["final_decision"] == "GO"


def test_m4_is_classified_optional_once_m1_is_supported():
    session = new_session()
    es.apply_experiment_result(session, "exp_m1_potency", "positive", "pass")
    state = planner_state(session)
    assert role_of(state, REDUNDANT_M4) == "optional_redundant"


def test_herg_is_chosen_over_redundant_m4():
    """The scenario from the notes: at the point only zero-score experiments
    remain, the planner picks a needed safety check, not the redundant M4."""
    session = new_session()
    # run everything that has a positive score first
    while True:
        state = planner_state(session)
        top = state["recommendation"]
        if top is None or score_of(state, top["experiment_id"]) == 0:
            break
        es.apply_experiment_result(session, top["experiment_id"], "positive", "pass")
    state = planner_state(session)
    assert state["recommendation"]["experiment_id"] != REDUNDANT_M4
    assert state["recommendation"]["experiment_id"] in SAFETY_ZERO_SCORE | {"exp_pd_safety_study"}


def test_optional_zero_score_experiments_never_outrank_required_ones():
    session = new_session()
    es.apply_experiment_result(session, "exp_m1_potency", "positive", "pass")
    ids = ranked_ids(planner_state(session))
    m4_index = ids.index(REDUNDANT_M4)
    for exp_id in SAFETY_ZERO_SCORE:
        assert ids.index(exp_id) < m4_index


def test_only_optional_experiments_left_means_no_recommendation():
    """If nothing required or positive-scored remains, don't recommend busywork."""
    session = new_session()
    es.apply_experiment_result(session, "exp_m1_potency", "positive", "pass")  # M4 now redundant
    scenario_state = session["scenario_state"]
    m4 = es.find_experiment_in_state(scenario_state, REDUNDANT_M4)
    only_m4 = [es.score_experiment_in_state(scenario_state, m4)]
    assert es.rank_experiment_scores_with_zero_fallback(scenario_state, only_m4) == []


# --------------------------------------------- characterization (known limit)
def test_positive_score_experiments_currently_outrank_safety_checks():
    """Documents the KNOWN LIMITATION from the deck: zero-score safety checks
    wait behind every positive-score experiment. If you change the ordering
    (e.g. parallel required checks), update or delete this test deliberately."""
    state = planner_state(new_session())
    ids = ranked_ids(state)
    positives = [i for i in ids if score_of(state, i) > 0]
    zeros = [i for i in ids if score_of(state, i) == 0]
    assert positives and zeros
    assert max(ids.index(i) for i in positives) < min(ids.index(i) for i in zeros)


def test_cheap_pk_check_runs_last_today():
    session = new_session()
    executed = run_to_end(session)
    # PK is cost 1 / time 1 but is only reached after the expensive trials
    assert executed.index("exp_pk_modeling") > executed.index("exp_poc_trial")


# ------------------------------------------------------------ determinism
def test_ranking_is_deterministic():
    first = ranked_ids(planner_state(new_session()))
    second = ranked_ids(planner_state(new_session()))
    assert first == second


def test_run_order_is_deterministic():
    assert run_to_end(new_session()) == run_to_end(new_session())


# ----------------------------------------------- other scenarios still work
def test_demo_scenario_runs_to_a_decision():
    session = new_session(DEMO)
    run_to_end(session)
    status = planner_state(session)["planner"]["status"]
    assert status in {"final_decision_reached", "no_useful_experiments", "dead_end_more_evidence"}


@pytest.mark.parametrize("path", sorted((ROOT / "data").glob("*.json")),
                         ids=lambda p: p.name)
def test_every_scenario_file_loads_and_ranks(path):
    """Guards against a scenario file breaking the planner (bad action names, etc.)."""
    session = new_session(path)
    planner_state(session)  # must not raise


# ------------------------------------------------- planner must not cheat
def test_hidden_ground_truth_is_not_exposed_to_the_planner():
    scenario = load(ROOT / "data" / "propranolol-scenario-v2.json")
    sanitized = es.sanitize_scenario_for_planner(scenario)
    assert "historical_ground_truth" not in sanitized
    dumped = json.dumps(sanitized)
    assert "historical_result" not in dumped.replace("historical_result_hidden", "")


# =========================================================================
# KNOWN GAPS (expected to fail today). See the review notes.
# =========================================================================
@pytest.mark.xfail(strict=True, reason=(
    "OPEN DESIGN DECISION: a real negative result on a `restrict` experiment "
    "currently falls through to the generic branch and marks the node "
    "'contradicted'. The scorer assumes it stays supported with restrictions. "
    "Delete this marker once you decide restrict (add the branch) vs kill "
    "(change the scenario file)."))
def test_negative_restrict_result_keeps_node_supported_with_restriction():
    session = new_session()
    es.apply_experiment_result(session, "exp_m1_potency", "positive", "pass")
    out = es.apply_experiment_result(session, "exp_herg", "negative", "pass")
    node = out["node_after_update"]
    assert node["status"] == "supported"
    assert node.get("restriction_active") is True
    assert node.get("restriction_source_experiment") == "exp_herg"


@pytest.mark.xfail(strict=True, reason=(
    "A `restrict` outcome should still allow the run to reach GO; today "
    "a negative hERG result ends in dead_end_more_evidence."))
def test_negative_herg_run_can_still_reach_go():
    session = new_session()
    run_to_end(session, {"exp_herg": "negative"})
    assert planner_state(session)["planner"]["final_decision"] == "GO"


@pytest.mark.xfail(strict=True, reason=(
    "Restrictions are not surfaced anywhere in planner output yet."))
def test_go_decision_reports_active_restrictions():
    session = new_session()
    run_to_end(session, {"exp_herg": "negative"})
    state = planner_state(session)
    assert "restriction" in json.dumps(state["planner"]["final_decision_details"] or {}).lower()


@pytest.mark.xfail(strict=True, reason=(
    "apply_hypothetical_result has no case for repeat_or_kill / repeat_or_prune, "
    "so scoring logs 'not implemented' and underestimates those experiments."))
@pytest.mark.parametrize("exp_id", ["exp_brain_exposure", "exp_poc_trial"])
def test_repeat_or_kill_actions_are_modeled_in_scoring(exp_id):
    state = deepcopy(load(XANOMELINE))
    experiment = es.find_experiment_in_state(state, exp_id)
    details = es.calculate_marginal_decision_impact_in_state(state, experiment)
    assert details["negative_unimplemented_actions"] == []
