import argparse
import json
from pathlib import Path


# Find the project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Path to our demo scenario
SCENARIO_FILE = PROJECT_ROOT / "data" / "demo-scenario.json"


def load_scenario():
    with open(SCENARIO_FILE, "r") as file:
        scenario = json.load(file)

    return scenario


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

    for prerequisite_node_id in node["depends_on"]:
        prerequisite_node = find_node(prerequisite_node_id)

        if prerequisite_node["status"] != "supported":
            print(
                "Skipping",
                experiment["name"],
                "because prerequisite",
                prerequisite_node["name"],
                "has status",
                prerequisite_node["status"],
            )
            return False

    return True


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
        return

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


def parse_args():
    parser = argparse.ArgumentParser(
        description="Rank experiments and optionally ingest one experimental result."
    )
    parser.add_argument("experiment_id", nargs="?")
    parser.add_argument("result", nargs="?", choices=["positive", "negative", "inconclusive"])

    return parser.parse_args()


scenario = load_scenario()


def main():
    args = parse_args()

    print("Drug:", scenario["drug"])
    print("Disease:", scenario["disease"])
    print("Number of experiments:", len(scenario["experiments"]))

    if args.experiment_id is None and args.result is None:
        print_current_state()
        return

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


if __name__ == "__main__":
    main()
