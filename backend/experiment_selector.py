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


scenario = load_scenario()

print("Drug:", scenario["drug"])
print("Disease:", scenario["disease"])
print("Number of experiments:", len(scenario["experiments"]))

def calculate_uncertainty(node):
    return 1 - node["confidence"]


def find_node(node_id):
    for node in scenario["nodes"]:
        if node["id"] == node_id:
            return node

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


print("\nNode uncertainties:")

for node in scenario["nodes"]:
    uncertainty = calculate_uncertainty(node)

    print(
        node["name"],
        "→",
        round(uncertainty, 2)
    )


experiment_scores = []

for experiment in scenario["experiments"]:
    experiment_scores.append(score_experiment(experiment))

ranked_experiments = sorted(
    experiment_scores,
    key=lambda experiment_score: experiment_score["score"],
    reverse=True,
)


print("\nRanked experiment scores:")

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


recommended = ranked_experiments[0]
recommended_experiment = recommended["experiment"]
recommended_node = recommended["node"]

print("\nRECOMMENDED NEXT EXPERIMENT")
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
