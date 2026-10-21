import json
import os
import urllib.error
import urllib.request


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
            "uncertainty": metrics["uncertainty"],
            "downstream_impact": metrics["downstream_impact"],
            "marginal_decision_impact": metrics[
                "marginal_decision_impact"
            ],
            "discriminating_power": metrics["discriminating_power"],
            "cost": metrics["cost"],
            "time": metrics["time"],
            "score": metrics["score"],
        },
        "planner_fact": (
            "This is the highest-ranked eligible experiment."
        ),
    }


def deterministic_fallback(context):
    """
    Generate an explanation without an LLM.

    This is used if the Groq API key is missing, Groq is unavailable,
    Qwen times out, or the returned response is invalid.
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
        return deterministic_fallback(context)

    model = os.getenv("LLM_MODEL", DEFAULT_MODEL)

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
                    + json.dumps(context, indent=2)
                    + "\n\nExplain why the planner selected "
                    + "this experiment."
                ),
            },
        ],
        "temperature": 0.2,
        "max_tokens": 200,
        "response_format": {
            "type": "json_object"
        },
    }

    request = urllib.request.Request(
        GROQ_URL,
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
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

        content = response_data["choices"][0]["message"]["content"]
        explanation = json.loads(content)

        recommendation_explanation = explanation.get(
            "recommendation_explanation"
        )

        if not isinstance(recommendation_explanation, str):
            raise ValueError(
                "Invalid LLM response structure"
            )

        return {
            "recommendation_explanation":
                recommendation_explanation
        }

    except (
        urllib.error.URLError,
        TimeoutError,
        KeyError,
        json.JSONDecodeError,
        ValueError,
    ):
        return deterministic_fallback(context)


if __name__ == "__main__":
    # Standalone test using the same nested structure that
    # build_explanation_context() will produce from the real planner.

    test_context = {
        "scenario": {
            "drug": "Propranolol",
            "disease": "Infantile hemangioma",
            "goal": (
                "Determine whether propranolol should advance "
                "for infantile hemangioma."
            ),
        },
        "recommended_experiment": {
            "id": "exp_enantiomer",
            "name": (
                "R(+) vs Racemic/S(-) Propranolol "
                "Functional Comparison"
            ),
            "tests_node": "Beta-Independent Activity",
        },
        "tested_node_state": {
            "status": "uncertain",
            "confidence": 0.35,
        },
        "planner_metrics": {
            "uncertainty": 0.65,
            "downstream_impact": 4,
            "marginal_decision_impact": 4,
            "discriminating_power": 0.95,
            "cost": 3,
            "time": 1,
            "score": 0.823,
        },
        "planner_fact": (
            "This is the highest-ranked eligible experiment."
        ),
    }

    explanation = explain_recommendation(test_context)

    print(
        json.dumps(
            explanation,
            indent=2,
        )
    )