import json
import os
import urllib.error
import urllib.request

from experiment_selector import PROJECT_ROOT, get_planner_state, load_scenario


GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "qwen/qwen3.8-27b"


SYSTEM_PROMPT = """
You are the explanation layer of an adaptive experimental-planning system.

Use ONLY information explicitly supplied in the planner context.

Do not introduce outside biomedical knowledge, disease biology,
mechanisms, clinical effects, experimental outcomes, or interpretations
that are not explicitly supplied.

Do not choose, alter, rerank, challenge, or replace the recommended
experiment. The deterministic planner is the source of truth.

Do not assign qualitative labels such as "high", "moderate", "low",
"cheap", "expensive", "fast", or "slow" to numerical values unless
that label is explicitly supplied by the planner. Report numerical
values exactly as supplied.

Do not invent experimental results.
Do not make GO/NO-GO decisions.
Do not fabricate sources.

If the supplied context does not support a statement, do not make it.

Write for a biomedical scientist who wants to understand the decision,
not the scoring implementation.

Explain the recommendation primarily in terms of:
- what unresolved node the experiment tests,
- why resolving that node matters to downstream decisions,
- and why the planner preferred this experiment over the other
  currently eligible options.

You may mention numerical metrics when useful, but do not list or
repeat all planner metrics.

Translate the supplied planner facts into a concise explanation rather
than restating the input fields.

Do not infer biological meaning beyond the supplied context.

Keep the explanation to 2-3 concise sentences.

Return JSON with exactly this structure:
{
  "recommendation_explanation": "string"
}
""".strip()


def build_explanation_context(planner_state):
    """
    Convert Labyrinth's real planner output into the minimal,
    grounded context sent to the LLM.

    This function does not calculate or change planner decisions.
    It only extracts information already produced by Labyrinth.
    """

    ranked_experiments = planner_state.get("ranked_experiments", [])

    if not ranked_experiments:
        return None

    top = ranked_experiments[0]
    experiment = top["experiment"]
    node = top["node"]
    metrics = top["metrics"]

    return {
        "scenario": {
            "drug": planner_state["scenario"]["drug"],
            "disease": planner_state["scenario"]["disease"],
            "goal": planner_state["scenario"].get("goal"),
        },
        "recommended_experiment": {
            "id": experiment["id"],
            "name": experiment["name"],
            "tests_node": node["name"],
        },
        "tested_node_state": {
            "status": node["status"],
            "confidence": node["confidence"],
        },
        "planner_metrics": {
            "uncertainty": round(
                metrics["uncertainty"],
                3,
            ),
            "downstream_impact": metrics[
                "downstream_impact"
            ],
            "marginal_decision_impact": round(
                metrics["marginal_decision_impact"],
                3,
            ),
            "discriminating_power": round(
                metrics["discriminating_power"],
                3,
            ),
            "cost": metrics["cost"],
            "time": metrics["time"],
            "score": round(
                metrics["score"],
                3,
            ),
        },
        "planner_fact": (
            "This is the highest-ranked eligible experiment."
        ),
    }


def deterministic_fallback(context):
    """
    Generate an explanation without an LLM.

    Used if Groq/Qwen is unavailable or returns an invalid response.
    """

    experiment = context["recommended_experiment"]
    metrics = context["planner_metrics"]

    return {
        "recommendation_explanation": (
            f'The planner selected {experiment["name"]} '
            f'because it was the highest-ranked eligible experiment '
            f'with uncertainty {metrics["uncertainty"]}, '
            f'downstream impact {metrics["downstream_impact"]}, '
            f'marginal decision impact '
            f'{metrics["marginal_decision_impact"]}, '
            f'discriminating power '
            f'{metrics["discriminating_power"]}, '
            f'cost {metrics["cost"]}, '
            f'time {metrics["time"]}, '
            f'and final score {metrics["score"]}.'
        )
    }


def explain_recommendation(context):
    """
    Ask Qwen to explain a recommendation already made by Labyrinth.

    Qwen explains the decision but does not make, modify,
    or rerank the decision.
    """

    if context is None:
        return {
            "recommendation_explanation": (
                "No experiment is currently recommended."
            )
        }

    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        print("LLM ERROR: GROQ_API_KEY is not loaded.")
        print("Using deterministic fallback.")

        return deterministic_fallback(context)

    model = os.getenv(
        "LLM_MODEL",
        DEFAULT_MODEL,
    )

    request_body = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": (
                    "PLANNER CONTEXT:\n"
                    + json.dumps(
                        context,
                        indent=2,
                    )
                    + "\n\nExplain why the planner selected "
                    + "this experiment."
                ),
            },
        ],
        "temperature": 0.2,
        "max_tokens": 200,
    }

    request = urllib.request.Request(
        GROQ_URL,
        data=json.dumps(
            request_body
        ).encode("utf-8"),
        headers={
    "Authorization": (
        f"Bearer {api_key}"
    ),
    "Content-Type": "application/json",
    "User-Agent": "Labyrinth/1.0",
},
        method="POST",
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=15,
        ) as response:
            response_data = json.loads(
                response.read().decode("utf-8")
            )

        content = (
            response_data["choices"][0]
            ["message"]["content"]
        )

        explanation = json.loads(content)

        recommendation_explanation = (
            explanation.get(
                "recommendation_explanation"
            )
        )

        if not isinstance(
            recommendation_explanation,
            str,
        ):
            raise ValueError(
                "Invalid LLM response structure"
            )

        return {
            "recommendation_explanation": (
                recommendation_explanation
            )
        }

    except urllib.error.HTTPError as error:
        error_body = error.read().decode(
            "utf-8",
            errors="replace",
        )

        print(
            "GROQ HTTP ERROR:",
            error.code,
        )
        print(
            "GROQ ERROR BODY:",
            error_body,
        )
        print(
            "Using deterministic fallback."
        )

        return deterministic_fallback(context)

    except (
        urllib.error.URLError,
        TimeoutError,
        KeyError,
        json.JSONDecodeError,
        ValueError,
    ) as error:
        print(
            "LLM ERROR:",
            repr(error),
        )
        print(
            "Using deterministic fallback."
        )

        return deterministic_fallback(context)


if __name__ == "__main__":
    # Load the real propranolol historical scenario.
    scenario_file = (
        PROJECT_ROOT
        / "data"
        / "propranolol-scenario-v2.json"
    )

    scenario = load_scenario(
        scenario_file
    )

    # Ask the real deterministic Labyrinth planner
    # to rank the available experiments.
    planner_state = get_planner_state(
        scenario,
        scenario_key="propranolol",
    )

    # Extract only the grounded information
    # that Qwen needs.
    context = build_explanation_context(
        planner_state
    )

    if context is None:
        print(
            "No experiment is currently recommended."
        )

    else:
        print(
            "\nLABYRINTH RECOMMENDATION"
        )
        print(
            context[
                "recommended_experiment"
            ]["name"]
        )

        print(
            "\nPLANNER CONTEXT"
        )
        print(
            json.dumps(
                context,
                indent=2,
            )
        )

        print(
            "\nQWEN EXPLANATION"
        )

        explanation = explain_recommendation(
            context
        )

        print(
            json.dumps(
                explanation,
                indent=2,
            )
        )