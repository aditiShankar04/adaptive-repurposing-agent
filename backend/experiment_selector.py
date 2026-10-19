import argparse
from copy import deepcopy
import json
import os
from pathlib import Path


# Find the project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Default scenario used when --scenario is not provided.
DEFAULT_SCENARIO_FILE = PROJECT_ROOT / "data" / "demo-scenario.json"

def load_scenario(scenario_file):
    with open(scenario_file, "r") as file:
        scenario = json.load(file)

    return scenario


def resolve_scenario_file(scenario_path):
    scenario_file = Path(scenario_path)

    if not scenario_file.is_absolute():
        scenario_file = PROJECT_ROOT / scenario_file

    return scenario_file


def calculate_uncertainty(node):
    return 1 - node["confidence"]


def find_node(node_id):
    for node in scenario["nodes"]:
        if node["id"] == node_id:
            return node

    return None


def find_experiment(experiment_id):
    for experiment in scenario["experiments"]:
        if experiment["id"] == experiment_id:
            return experiment

    return None


def find_downstream_descendants(node_id, visited=None):
    if visited is None:
        visited = set()

    node = find_node(node_id)

    if node is None:
        return visited

    for downstream_node_id in node["downstream"]:
        if downstream_node_id not in visited:
            visited.add(downstream_node_id)
            find_downstream_descendants(downstream_node_id, visited)

    return visited


def calculate_downstream_impact(node):
    downstream_descendants = find_downstream_descendants(node["id"])

    return max(len(downstream_descendants), 1)


def find_node_in_state(scenario_state, node_id):
    for node in scenario_state["nodes"]:
        if node["id"] == node_id:
            return node

    return None


def get_dependency_logic_for_node(node):
    depends_on = node["depends_on"]
    dependency_logic = node.get("dependency_logic")

    if dependency_logic is None:
        if depends_on:
            dependency_logic = "all"
        else:
            dependency_logic = "none"

    return dependency_logic


def get_prerequisite_nodes_in_state(scenario_state, node):
    return [
        find_node_in_state(scenario_state, prerequisite_node_id)
        for prerequisite_node_id in node["depends_on"]
    ]


def find_downstream_descendants_in_state(scenario_state, node_id, visited=None):
    if visited is None:
        visited = set()

    node = find_node_in_state(scenario_state, node_id)

    if node is None:
        return visited

    for downstream_node_id in node["downstream"]:
        if downstream_node_id not in visited:
            visited.add(downstream_node_id)
            find_downstream_descendants_in_state(
                scenario_state,
                downstream_node_id,
                visited,
            )

    return visited


def get_final_decision_nodes_in_state(scenario_state):
    return [
        node
        for node in scenario_state["nodes"]
        if node.get("node_type") == "final_decision"
    ]


def is_node_potentially_satisfiable_in_state(
    scenario_state,
    node,
    assumed_supported=None,
    visiting=None,
):
    if assumed_supported is None:
        assumed_supported = set()

    if visiting is None:
        visiting = set()

    if node["id"] in assumed_supported:
        return True

    if node["status"] == "supported":
        return True

    if node["status"] == "contradicted":
        return False

    if node["id"] in visiting:
        return True

    visiting.add(node["id"])
    dependency_logic = get_dependency_logic_for_node(node)

    if dependency_logic == "none":
        visiting.remove(node["id"])
        return True

    prerequisite_nodes = get_prerequisite_nodes_in_state(scenario_state, node)

    if dependency_logic == "all":
        is_potentially_satisfiable = all(
            is_node_potentially_satisfiable_in_state(
                scenario_state,
                prerequisite_node,
                assumed_supported,
                visiting,
            )
            for prerequisite_node in prerequisite_nodes
        )
        visiting.remove(node["id"])
        return is_potentially_satisfiable

    if dependency_logic == "any":
        is_potentially_satisfiable = any(
            is_node_potentially_satisfiable_in_state(
                scenario_state,
                prerequisite_node,
                assumed_supported,
                visiting,
            )
            for prerequisite_node in prerequisite_nodes
        )
        visiting.remove(node["id"])
        return is_potentially_satisfiable

    visiting.remove(node["id"])
    raise ValueError("Unknown dependency_logic: " + dependency_logic)


def is_experiment_eligible_in_state(scenario_state, experiment):
    node = find_node_in_state(scenario_state, experiment["tests_node"])

    if node["status"] in ["supported", "contradicted"]:
        return False

    dependency_logic = get_dependency_logic_for_node(node)

    if dependency_logic == "none":
        return True

    prerequisite_nodes = get_prerequisite_nodes_in_state(scenario_state, node)

    if dependency_logic == "all":
        return all(
            prerequisite_node["status"] == "supported"
            for prerequisite_node in prerequisite_nodes
        )

    if dependency_logic == "any":
        return any(
            prerequisite_node["status"] == "supported"
            for prerequisite_node in prerequisite_nodes
        )

    raise ValueError("Unknown dependency_logic: " + dependency_logic)


def can_node_reach_final_decision_in_state(scenario_state, node, final_decision_node):
    if node["id"] == final_decision_node["id"]:
        return True

    return final_decision_node["id"] in find_downstream_descendants_in_state(
        scenario_state,
        node["id"],
    )


def can_experiment_contribute_to_final_decision_in_state(scenario_state, experiment):
    final_decision_nodes = get_final_decision_nodes_in_state(scenario_state)

    if not final_decision_nodes:
        return True

    node = find_node_in_state(scenario_state, experiment["tests_node"])

    for final_decision_node in final_decision_nodes:
        if not can_node_reach_final_decision_in_state(
            scenario_state,
            node,
            final_decision_node,
        ):
            continue

        if is_node_potentially_satisfiable_in_state(
            scenario_state,
            final_decision_node,
            assumed_supported={node["id"]},
        ):
            return True

    return False


def record_hypothetical_note(scenario_state, note):
    if "_hypothetical_notes" not in scenario_state:
        scenario_state["_hypothetical_notes"] = []

    scenario_state["_hypothetical_notes"].append(note)


def apply_hypothetical_result(scenario_state, experiment, result):
    node = find_node_in_state(scenario_state, experiment["tests_node"])

    if result == "positive":
        action = experiment.get("positive_action")
    else:
        action = experiment.get("negative_action")

    if result == "positive" and action == "advance":
        node["status"] = "supported"
        node["confidence"] = min(node["confidence"] + 0.5, 1)
        return

    if result == "negative" and action == "prune":
        node["status"] = "contradicted"
        node["confidence"] = max(node["confidence"] - 0.5, 0)
        return

    if result == "negative" and action == "restrict":
        node["status"] = "supported"
        node["confidence"] = min(node["confidence"] + 0.25, 1)
        node["restriction_active"] = True
        node["restriction_source_experiment"] = experiment["id"]
        record_hypothetical_note(
            scenario_state,
            "Negative result for "
            + experiment["name"]
            + " uses restrict semantics: path remains viable with restrictions.",
        )
        return

    node["hypothetical_action_unimplemented"] = action
    record_hypothetical_note(
        scenario_state,
        "Action semantics not implemented for "
        + experiment["name"]
        + " ("
        + result
        + " action: "
        + str(action)
        + ").",
    )


def summarize_program_state(scenario_state):
    node_reachability = {
        node["id"]: is_node_potentially_satisfiable_in_state(
            scenario_state,
            node,
        )
        for node in scenario_state["nodes"]
    }
    useful_experiment_ids = {
        experiment["id"]
        for experiment in scenario_state["experiments"]
        if (
            is_experiment_eligible_in_state(scenario_state, experiment)
            and can_experiment_contribute_to_final_decision_in_state(
                scenario_state,
                experiment,
            )
        )
    }
    final_decision_reachability = {
        node["id"]: is_node_potentially_satisfiable_in_state(
            scenario_state,
            node,
        )
        for node in get_final_decision_nodes_in_state(scenario_state)
    }
    restricted_node_ids = {
        node["id"]
        for node in scenario_state["nodes"]
        if node.get("restriction_active")
    }
    unimplemented_actions = [
        note
        for note in scenario_state.get("_hypothetical_notes", [])
        if "not implemented" in note
    ]
    restriction_notes = [
        note
        for note in scenario_state.get("_hypothetical_notes", [])
        if "restrict semantics" in note
    ]

    return {
        "node_reachability": node_reachability,
        "useful_experiment_ids": useful_experiment_ids,
        "final_decision_reachability": final_decision_reachability,
        "restricted_node_ids": restricted_node_ids,
        "unimplemented_actions": unimplemented_actions,
        "restriction_notes": restriction_notes,
    }


def calculate_boolean_map_difference(first_map, second_map):
    keys = set(first_map) | set(second_map)

    if not keys:
        return 0

    changed_keys = [
        key
        for key in keys
        if first_map.get(key) != second_map.get(key)
    ]

    return len(changed_keys) / len(keys)


def calculate_set_difference(first_set, second_set):
    union = first_set | second_set

    if not union:
        return 0

    return len(first_set ^ second_set) / len(union)


def get_experiment_names_by_id(experiment_ids):
    names = []

    for experiment_id in sorted(experiment_ids):
        experiment = find_experiment(experiment_id)

        if experiment is not None:
            names.append(experiment["name"])

    return names


def get_node_names_by_id(node_ids):
    names = []

    for node_id in sorted(node_ids):
        node = find_node(node_id)

        if node is not None:
            names.append(node["name"])

    return names


def compare_program_states(positive_summary, negative_summary):
    node_difference = calculate_boolean_map_difference(
        positive_summary["node_reachability"],
        negative_summary["node_reachability"],
    )
    useful_experiment_difference = calculate_set_difference(
        positive_summary["useful_experiment_ids"],
        negative_summary["useful_experiment_ids"],
    )
    final_decision_difference = calculate_boolean_map_difference(
        positive_summary["final_decision_reachability"],
        negative_summary["final_decision_reachability"],
    )
    marginal_decision_impact = (
        node_difference
        + useful_experiment_difference
        + final_decision_difference
    ) / 3
    changed_node_ids = {
        node_id
        for node_id in positive_summary["node_reachability"]
        if (
            positive_summary["node_reachability"].get(node_id)
            != negative_summary["node_reachability"].get(node_id)
        )
    }

    return {
        "marginal_decision_impact": marginal_decision_impact,
        "node_difference": node_difference,
        "useful_experiment_difference": useful_experiment_difference,
        "final_decision_difference": final_decision_difference,
        "changed_node_names": get_node_names_by_id(changed_node_ids),
        "positive_only_experiment_names": get_experiment_names_by_id(
            positive_summary["useful_experiment_ids"]
            - negative_summary["useful_experiment_ids"]
        ),
        "negative_only_experiment_names": get_experiment_names_by_id(
            negative_summary["useful_experiment_ids"]
            - positive_summary["useful_experiment_ids"]
        ),
        "positive_restriction_node_names": get_node_names_by_id(
            positive_summary["restricted_node_ids"]
        ),
        "negative_restriction_node_names": get_node_names_by_id(
            negative_summary["restricted_node_ids"]
        ),
        "positive_unimplemented_actions": positive_summary["unimplemented_actions"],
        "negative_unimplemented_actions": negative_summary["unimplemented_actions"],
        "positive_restriction_notes": positive_summary["restriction_notes"],
        "negative_restriction_notes": negative_summary["restriction_notes"],
    }


def calculate_marginal_decision_impact(experiment):
    positive_scenario = deepcopy(scenario)
    negative_scenario = deepcopy(scenario)

    apply_hypothetical_result(positive_scenario, experiment, "positive")
    apply_hypothetical_result(negative_scenario, experiment, "negative")

    positive_summary = summarize_program_state(positive_scenario)
    negative_summary = summarize_program_state(negative_scenario)

    return compare_program_states(positive_summary, negative_summary)


def score_experiment(experiment):
    node = find_node(experiment["tests_node"])
    uncertainty = calculate_uncertainty(node)
    downstream_impact = calculate_downstream_impact(node)
    impact_details = calculate_marginal_decision_impact(experiment)
    marginal_decision_impact = impact_details["marginal_decision_impact"]
    discriminating_power = experiment["discriminating_power"]
    cost = experiment["cost"]
    time = experiment["time"]
    score = (
        uncertainty
        * marginal_decision_impact
        * discriminating_power
        / (cost * time)
    )

    return {
        "experiment": experiment,
        "node": node,
        "uncertainty": uncertainty,
        "downstream_impact": downstream_impact,
        "marginal_decision_impact": marginal_decision_impact,
        "impact_details": impact_details,
        "discriminating_power": discriminating_power,
        "cost": cost,
        "time": time,
        "score": score,
    }


def get_dependency_logic(node):
    depends_on = node["depends_on"]
    dependency_logic = node.get("dependency_logic")

    if dependency_logic is None:
        if depends_on:
            dependency_logic = "all"
        else:
            dependency_logic = "none"

    return dependency_logic


def get_prerequisite_nodes(node):
    return [find_node(prerequisite_node_id) for prerequisite_node_id in node["depends_on"]]


def format_prerequisite_statuses(prerequisite_nodes):
    return ", ".join(
        prerequisite_node["name"] + " (" + prerequisite_node["status"] + ")"
        for prerequisite_node in prerequisite_nodes
    )


def get_final_decision_nodes():
    return [
        node
        for node in scenario["nodes"]
        if node.get("node_type") == "final_decision"
    ]


def is_node_potentially_satisfiable(node, assumed_supported=None, visiting=None):
    if assumed_supported is None:
        assumed_supported = set()

    if visiting is None:
        visiting = set()

    if node["id"] in assumed_supported:
        return True

    if node["status"] == "supported":
        return True

    if node["status"] == "contradicted":
        return False

    if node["id"] in visiting:
        return True

    visiting.add(node["id"])
    dependency_logic = get_dependency_logic(node)

    if dependency_logic == "none":
        visiting.remove(node["id"])
        return True

    prerequisite_nodes = get_prerequisite_nodes(node)

    if dependency_logic == "all":
        is_potentially_satisfiable = all(
            is_node_potentially_satisfiable(
                prerequisite_node,
                assumed_supported,
                visiting,
            )
            for prerequisite_node in prerequisite_nodes
        )
        visiting.remove(node["id"])
        return is_potentially_satisfiable

    if dependency_logic == "any":
        is_potentially_satisfiable = any(
            is_node_potentially_satisfiable(
                prerequisite_node,
                assumed_supported,
                visiting,
            )
            for prerequisite_node in prerequisite_nodes
        )
        visiting.remove(node["id"])
        return is_potentially_satisfiable

    visiting.remove(node["id"])
    raise ValueError("Unknown dependency_logic: " + dependency_logic)


def can_node_reach_final_decision(node, final_decision_node):
    if node["id"] == final_decision_node["id"]:
        return True

    return final_decision_node["id"] in find_downstream_descendants(node["id"])


def can_experiment_contribute_to_final_decision(experiment):
    final_decision_nodes = get_final_decision_nodes()

    if not final_decision_nodes:
        return True

    node = find_node(experiment["tests_node"])

    for final_decision_node in final_decision_nodes:
        if not can_node_reach_final_decision(node, final_decision_node):
            continue

        if is_node_potentially_satisfiable(
            final_decision_node,
            assumed_supported={node["id"]},
        ):
            return True

    print(
        "Skipping",
        experiment["name"],
        "because resolving",
        node["name"],
        "cannot restore a viable path to a final decision.",
    )
    return False


def get_unreachable_final_decision_dependencies(final_decision_node):
    return [
        prerequisite_node
        for prerequisite_node in get_prerequisite_nodes(final_decision_node)
        if not is_node_potentially_satisfiable(prerequisite_node)
    ]


def print_dead_end_state():
    final_decision_nodes = get_final_decision_nodes()
    printed_dead_end = False

    for final_decision_node in final_decision_nodes:
        unreachable_dependencies = get_unreachable_final_decision_dependencies(
            final_decision_node
        )

        if not unreachable_dependencies:
            continue

        if not printed_dead_end:
            print("\nPROGRAM STATE: DEAD END / MORE EVIDENCE")
            printed_dead_end = True

        print("\nReason:")
        print(
            "The current graph cannot satisfy",
            final_decision_node["name"],
            "because:",
        )

        for prerequisite_node in unreachable_dependencies:
            print(
                "-",
                prerequisite_node["name"],
                "is unreachable under the current dependency model.",
            )

        print(
            "This is not an automatic NO-GO; it means the current modeled path is exhausted "
            "and more evidence or an alternative mechanism may be needed."
        )

    return printed_dead_end


def is_experiment_eligible(experiment):
    node = find_node(experiment["tests_node"])

    if node["status"] in ["supported", "contradicted"]:
        print(
            "Skipping",
            experiment["name"],
            "because",
            node["name"],
            "is already resolved with status",
            node["status"],
        )
        return False

    dependency_logic = get_dependency_logic(node)

    if dependency_logic == "none":
        return True

    prerequisite_nodes = get_prerequisite_nodes(node)

    if dependency_logic == "all":
        blocking_prerequisites = [
            prerequisite_node
            for prerequisite_node in prerequisite_nodes
            if prerequisite_node["status"] != "supported"
        ]

        if blocking_prerequisites:
            print(
                "Skipping",
                experiment["name"],
                "because these prerequisites are not supported:",
                format_prerequisite_statuses(blocking_prerequisites),
            )
            return False

        return True

    if dependency_logic == "any":
        for prerequisite_node in prerequisite_nodes:
            if prerequisite_node["status"] == "supported":
                return True

        print(
            "Skipping",
            experiment["name"],
            "because none of these prerequisites are supported:",
            format_prerequisite_statuses(prerequisite_nodes),
        )
        return False

    raise ValueError("Unknown dependency_logic: " + dependency_logic)


def evaluate_final_decision(node):
    dependency_logic = get_dependency_logic(node)
    prerequisite_nodes = get_prerequisite_nodes(node)

    if dependency_logic == "none":
        return {
            "node": node,
            "decision": "GO",
            "reason": "No prerequisite gates are required.",
            "prerequisite_nodes": prerequisite_nodes,
        }

    if dependency_logic == "all":
        unsupported_prerequisites = [
            prerequisite_node
            for prerequisite_node in prerequisite_nodes
            if prerequisite_node["status"] != "supported"
        ]

        if not unsupported_prerequisites:
            return {
                "node": node,
                "decision": "GO",
                "reason": "All required candidate-level gates are supported:",
                "prerequisite_nodes": prerequisite_nodes,
            }

        contradicted_prerequisites = [
            prerequisite_node
            for prerequisite_node in unsupported_prerequisites
            if prerequisite_node["status"] == "contradicted"
        ]

        if contradicted_prerequisites:
            reason = (
                "One or more required dependencies are contradicted. Final NO-GO "
                "semantics will later depend on failure_scope / experiment actions:"
            )
        else:
            reason = "One or more required dependencies still need more evidence:"

        return {
            "node": node,
            "decision": "MORE EVIDENCE",
            "reason": reason,
            "prerequisite_nodes": prerequisite_nodes,
        }

    if dependency_logic == "any":
        for prerequisite_node in prerequisite_nodes:
            if prerequisite_node["status"] == "supported":
                return {
                    "node": node,
                    "decision": "GO",
                    "reason": "At least one required path is supported:",
                    "prerequisite_nodes": prerequisite_nodes,
                }

        return {
            "node": node,
            "decision": "MORE EVIDENCE",
            "reason": "No required path is supported yet:",
            "prerequisite_nodes": prerequisite_nodes,
        }

    raise ValueError("Unknown dependency_logic: " + dependency_logic)


def evaluate_final_decisions():
    return [
        evaluate_final_decision(node)
        for node in get_final_decision_nodes()
    ]


def print_final_decisions():
    final_decisions = evaluate_final_decisions()

    if not final_decisions:
        return final_decisions

    print("\nFINAL DECISION")

    for final_decision in final_decisions:
        print(final_decision["node"]["name"] + ":", final_decision["decision"])
        print("\nReason:")
        print(final_decision["reason"])

        for prerequisite_node in final_decision["prerequisite_nodes"]:
            print("-", prerequisite_node["name"] + ":", prerequisite_node["status"])

        if final_decision["decision"] == "MORE EVIDENCE":
            print(
                "The current graph has no useful experiments left, but final decision logic "
                "is unresolved at this MVP stage."
            )

    return final_decisions


def normalize_qc(qc):
    if qc is None or qc == "":
        return "pass"

    normalized_qc = qc.strip().lower()

    if normalized_qc not in ["pass", "questionable", "fail"]:
        raise ValueError("QC must be pass, questionable, or fail")

    return normalized_qc


def build_qc_update_details(experiment, result, qc, state_updated):
    details = {
        "qc": qc,
        "state_updated": state_updated,
        "reason": "",
        "recommended_action": "",
    }

    if qc == "pass":
        details["reason"] = "This result is trusted enough to update the decision graph."

        if result == "inconclusive" and experiment.get("inconclusive_action") == "repeat":
            details["state_updated"] = False
            details["reason"] = "The result is inconclusive, so the tested node remains unresolved."
            details["recommended_action"] = "REPEAT " + experiment["name"]

        return details

    details["state_updated"] = False

    if qc == "questionable":
        details["reason"] = (
            "This evidence needs confirmation before it can support pruning, "
            "restriction, or candidate-level conclusions."
        )
        details["recommended_action"] = "REPEAT / CONFIRM " + experiment["name"]
        return details

    details["reason"] = "This result is not trustworthy enough to change the decision graph."
    details["recommended_action"] = "REPEAT / TROUBLESHOOT " + experiment["name"]
    return details


def print_qc_update_details(update_details):
    print("\nQC VERDICT:", update_details["qc"].upper())

    if update_details["state_updated"]:
        print("Scientific state updated.")
    else:
        print("Scientific state NOT updated.")

    print("\nReason:")
    print(update_details["reason"])

    if update_details["recommended_action"]:
        print("\nRecommended action:")
        print(update_details["recommended_action"])


def update_node_from_result(experiment_id, result, qc="pass"):
    experiment = find_experiment(experiment_id)

    if experiment is None:
        raise ValueError("Unknown experiment_id: " + experiment_id)

    node = find_node(experiment["tests_node"])

    if node is None:
        raise ValueError("Experiment tests unknown node: " + experiment["tests_node"])

    node_before_update = node.copy()
    normalized_qc = normalize_qc(qc)
    update_details = build_qc_update_details(
        experiment,
        result,
        normalized_qc,
        True,
    )

    if normalized_qc in ["questionable", "fail"]:
        return experiment, node_before_update, node, update_details

    if result == "inconclusive" and experiment.get("inconclusive_action") == "repeat":
        return experiment, node_before_update, node, update_details

    if result == "positive":
        node["confidence"] = min(node["confidence"] + 0.5, 1)
        node["status"] = "supported"
    elif result == "negative":
        node["confidence"] = max(node["confidence"] - 0.5, 0)
        node["status"] = "contradicted"
    elif result == "inconclusive":
        node["status"] = "uncertain"
    else:
        raise ValueError("Result must be positive, negative, or inconclusive")

    return experiment, node_before_update, node, update_details


def rank_experiments():
    experiment_scores = []

    for experiment in scenario["experiments"]:
        if (
            is_experiment_eligible(experiment)
            and can_experiment_contribute_to_final_decision(experiment)
        ):
            experiment_scores.append(score_experiment(experiment))

    return sorted(
        experiment_scores,
        key=lambda experiment_score: experiment_score["score"],
        reverse=True,
    )


def print_node_uncertainties():
    print("\nNode uncertainties:")

    for node in scenario["nodes"]:
        uncertainty = calculate_uncertainty(node)

        print(
            node["name"],
            "→",
            round(uncertainty, 2),
            "| status:",
            node["status"],
            "| confidence:",
            round(node["confidence"], 2),
        )


def print_rankings(ranked_experiments, heading="Ranked experiment scores"):
    print("\n" + heading + ":")

    for rank, experiment_score in enumerate(ranked_experiments, start=1):
        experiment = experiment_score["experiment"]
        node = experiment_score["node"]

        print(
            str(rank) + ".",
            experiment["name"],
            "→ tests:",
            node["name"],
            "| uncertainty:",
            round(experiment_score["uncertainty"], 2),
            "| downstream impact:",
            experiment_score["downstream_impact"],
            "| marginal decision impact:",
            round(experiment_score["marginal_decision_impact"], 3),
            "| discriminating power:",
            experiment_score["discriminating_power"],
            "| cost:",
            experiment_score["cost"],
            "| time:",
            experiment_score["time"],
            "| score:",
            round(experiment_score["score"], 3)
        )


def print_marginal_impact_explanation(experiment_score):
    impact_details = experiment_score["impact_details"]

    print("Program-difference check:")
    print(
        "- Node reachability difference:",
        round(impact_details["node_difference"], 3),
    )
    print(
        "- Useful experiment eligibility difference:",
        round(impact_details["useful_experiment_difference"], 3),
    )
    print(
        "- Final-decision reachability difference:",
        round(impact_details["final_decision_difference"], 3),
    )

    changed_node_names = impact_details["changed_node_names"]
    positive_only_experiment_names = impact_details["positive_only_experiment_names"]
    negative_only_experiment_names = impact_details["negative_only_experiment_names"]
    positive_restriction_node_names = impact_details["positive_restriction_node_names"]
    negative_restriction_node_names = impact_details["negative_restriction_node_names"]
    positive_unimplemented_actions = impact_details["positive_unimplemented_actions"]
    negative_unimplemented_actions = impact_details["negative_unimplemented_actions"]

    if changed_node_names:
        print("- Reachability changed for:", "; ".join(changed_node_names[:5]))

    if positive_only_experiment_names:
        print(
            "- Useful only if positive:",
            "; ".join(positive_only_experiment_names[:5]),
        )

    if negative_only_experiment_names:
        print(
            "- Useful only if negative:",
            "; ".join(negative_only_experiment_names[:5]),
        )

    if positive_restriction_node_names:
        print(
            "- Restrictions active only if positive:",
            "; ".join(positive_restriction_node_names[:5]),
        )

    if negative_restriction_node_names:
        print(
            "- Restrictions active only if negative:",
            "; ".join(negative_restriction_node_names[:5]),
        )

    for note in positive_unimplemented_actions[:3]:
        print("- Positive simulation note:", note)

    for note in negative_unimplemented_actions[:3]:
        print("- Negative simulation note:", note)

    if (
        not changed_node_names
        and not positive_only_experiment_names
        and not negative_only_experiment_names
        and not positive_restriction_node_names
        and not negative_restriction_node_names
        and not positive_unimplemented_actions
        and not negative_unimplemented_actions
    ):
        print("- Positive and negative outcomes produce very similar program states.")


def print_recommendation(ranked_experiments, heading="RECOMMENDED NEXT EXPERIMENT"):
    if not ranked_experiments:
        print("\n" + heading)
        print("No useful experiments remain.")
        print_final_decisions()
        print_dead_end_state()
        return None

    recommended = ranked_experiments[0]
    recommended_experiment = recommended["experiment"]
    recommended_node = recommended["node"]

    print("\n" + heading)
    print("Experiment:", recommended_experiment["name"])
    print("Tests:", recommended_node["name"])
    print("Score:", round(recommended["score"], 3))
    print(
        "Why:",
        recommended_experiment["name"],
        "ranked highest because it tests",
        recommended_node["name"],
        "with uncertainty",
        round(recommended["uncertainty"], 2),
        "and marginal decision impact",
        round(recommended["marginal_decision_impact"], 3),
        "while having discriminating power",
        recommended["discriminating_power"],
        "at cost",
        recommended["cost"],
        "and time",
        recommended["time"],
    )
    print_marginal_impact_explanation(recommended)

    return recommended


def print_current_state():
    print_node_uncertainties()
    ranked_experiments = rank_experiments()
    print_rankings(ranked_experiments)
    print_recommendation(ranked_experiments)


def print_node_state(node):
    print("Node:", node["name"])
    print("Status:", node["status"])
    print("Confidence:", round(node["confidence"], 2))
    print("Uncertainty:", round(calculate_uncertainty(node), 2))


def run_interactive_session():
    round_number = 1

    while True:
        print("\n===== ROUND", str(round_number), "=====")
        print_node_uncertainties()
        ranked_experiments = rank_experiments()
        print_rankings(ranked_experiments)
        recommended = print_recommendation(ranked_experiments)

        if recommended is None:
            final_decisions = evaluate_final_decisions()

            if any(
                final_decision["decision"] == "GO"
                for final_decision in final_decisions
            ):
                print("Ending session because a final decision was reached.")
            elif final_decisions:
                print("Ending session because no useful experiments remain.")

            break

        recommended_experiment = recommended["experiment"]
        result = input(
            "\nEnter result for "
            + recommended_experiment["name"]
            + " (positive/negative/inconclusive/quit): "
        ).strip().lower()

        if result == "quit":
            print("Ending session.")
            break

        if result not in ["positive", "negative", "inconclusive"]:
            print("Result must be positive, negative, inconclusive, or quit.")
            continue

        qc = input(
            "Enter QC for "
            + recommended_experiment["name"]
            + " (pass/questionable/fail) [pass]: "
        ).strip().lower()

        if qc == "":
            qc = "pass"

        if qc not in ["pass", "questionable", "fail"]:
            print("QC must be pass, questionable, fail, or blank for pass.")
            continue

        experiment, node_before_update, node_after_update, update_details = update_node_from_result(
            recommended_experiment["id"],
            result,
            qc,
        )

        print("\nSUBMITTED RESULT")
        print("Experiment:", experiment["name"])
        print("Result:", result)
        print_qc_update_details(update_details)

        print("\nNODE BEFORE UPDATE")
        print_node_state(node_before_update)

        print("\nNODE AFTER UPDATE")
        print_node_state(node_after_update)

        print("\nRecalculating with updated in-memory state...")
        updated_ranked_experiments = rank_experiments()
        print_rankings(updated_ranked_experiments, "Updated ranked experiment scores")
        print_recommendation(updated_ranked_experiments, "UPDATED RECOMMENDED NEXT EXPERIMENT")

        if not updated_ranked_experiments:
            final_decisions = evaluate_final_decisions()

            if any(
                final_decision["decision"] == "GO"
                for final_decision in final_decisions
            ):
                print("Ending session because a final decision was reached.")
            elif final_decisions:
                print("Ending session because no useful experiments remain.")

            break

        round_number = round_number + 1


def parse_args():
    parser = argparse.ArgumentParser(
        description="Rank experiments and optionally ingest one experimental result."
    )
    parser.add_argument(
        "--scenario",
        default=str(DEFAULT_SCENARIO_FILE.relative_to(PROJECT_ROOT)),
        help="Path to the JSON scenario file to load.",
    )
    parser.add_argument(
        "--session",
        action="store_true",
        help="Run an interactive multi-round in-memory research session.",
    )
    parser.add_argument("experiment_id", nargs="?")
    parser.add_argument("result", nargs="?", choices=["positive", "negative", "inconclusive"])
    parser.add_argument("qc", nargs="?", default="pass")

    return parser.parse_args()


scenario = None


def main():
    global scenario

    args = parse_args()
    scenario_file = resolve_scenario_file(args.scenario)

    if not scenario_file.exists():
        print("Error: scenario file not found:", scenario_file)
        return 1

    scenario = load_scenario(scenario_file)

    print("Loaded scenario file:", scenario_file)
    print("Drug:", scenario["drug"])
    print("Disease:", scenario["disease"])
    print("Number of experiments:", len(scenario["experiments"]))

    if args.session:
        run_interactive_session()
        return 0

    if args.experiment_id is None and args.result is None:
        print_current_state()
        return 0

    if args.experiment_id is None or args.result is None:
        raise ValueError("Provide both experiment_id and result, or neither.")

    previous_ranked_experiments = rank_experiments()
    print_recommendation(previous_ranked_experiments, "PREVIOUS RECOMMENDATION")

    experiment, node_before_update, node_after_update, update_details = update_node_from_result(
        args.experiment_id,
        args.result,
        args.qc,
    )

    print("\nSUBMITTED RESULT")
    print("Experiment:", experiment["name"])
    print("Result:", args.result)
    print_qc_update_details(update_details)

    print("\nNODE BEFORE UPDATE")
    print_node_state(node_before_update)

    print("\nNODE AFTER UPDATE")
    print_node_state(node_after_update)

    print_node_uncertainties()
    new_ranked_experiments = rank_experiments()
    print_rankings(new_ranked_experiments, "New ranked experiment scores")
    print_recommendation(new_ranked_experiments, "NEW RECOMMENDED NEXT EXPERIMENT")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
