import argparse
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


def score_experiment(experiment):
    node = find_node(experiment["tests_node"])
    uncertainty = calculate_uncertainty(node)
    downstream_impact = calculate_downstream_impact(node)
    discriminating_power = experiment["discriminating_power"]
    cost = experiment["cost"]
    time = experiment["time"]
    score = (
        uncertainty
        * downstream_impact
        * discriminating_power
        / (cost * time)
    )

    return {
        "experiment": experiment,
        "node": node,
        "uncertainty": uncertainty,
        "downstream_impact": downstream_impact,
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
        for node in scenario["nodes"]
        if node.get("node_type") == "final_decision"
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
                "The current graph has no eligible experiments left, but final decision logic "
                "is unresolved at this MVP stage."
            )

    return final_decisions


def update_node_from_result(experiment_id, result):
    experiment = find_experiment(experiment_id)

    if experiment is None:
        raise ValueError("Unknown experiment_id: " + experiment_id)

    node = find_node(experiment["tests_node"])

    if node is None:
        raise ValueError("Experiment tests unknown node: " + experiment["tests_node"])

    node_before_update = node.copy()

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

    return experiment, node_before_update, node


def rank_experiments():
    experiment_scores = []

    for experiment in scenario["experiments"]:
        if is_experiment_eligible(experiment):
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
            "| discriminating power:",
            experiment_score["discriminating_power"],
            "| cost:",
            experiment_score["cost"],
            "| time:",
            experiment_score["time"],
            "| score:",
            round(experiment_score["score"], 3)
        )


def print_recommendation(ranked_experiments, heading="RECOMMENDED NEXT EXPERIMENT"):
    if not ranked_experiments:
        print("\n" + heading)
        print("No eligible experiments remain.")
        print_final_decisions()
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
        "and affects",
        recommended["downstream_impact"],
        "downstream node(s), while having discriminating power",
        recommended["discriminating_power"],
        "at cost",
        recommended["cost"],
        "and time",
        recommended["time"],
    )

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
                print("Ending session because no eligible experiments remain.")

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

        experiment, node_before_update, node_after_update = update_node_from_result(
            recommended_experiment["id"],
            result,
        )

        print("\nSUBMITTED RESULT")
        print("Experiment:", experiment["name"])
        print("Result:", result)

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
                print("Ending session because no eligible experiments remain.")

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

    experiment, node_before_update, node_after_update = update_node_from_result(
        args.experiment_id,
        args.result,
    )

    print("\nSUBMITTED RESULT")
    print("Experiment:", experiment["name"])
    print("Result:", args.result)

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
