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


def deterministic_fallback(context):
    """Explanation used if Groq/Qwen is unavailable."""
    return {
        "recommendation_explanation": (
            f'The planner selected {context["recommended_experiment"]} '
            f'because it was the highest-ranked eligible experiment '
            f'with uncertainty {context["uncertainty"]}, '
            f'downstream impact {context["downstream_impact"]}, '
            f'discriminating power {context["discriminating_power"]}, '
            f'cost {context["cost"]}, time {context["time"]}, '
            f'and final score {context["score"]}.'
        )
    }


def explain_recommendation(context):
    """
    Ask Qwen to explain a recommendation already made by Labyrinth.

    Qwen explains the decision but does not make or modify it.
    """

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
                    + "\n\nExplain why the planner selected this experiment."
                ),
            },
        ],
        "temperature": 0.2,
        "max_tokens": 200,
        "response_format": {"type": "json_object"},
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
        with urllib.request.urlopen(request, timeout=15) as response:
            response_data = json.loads(response.read().decode("utf-8"))

        content = response_data["choices"][0]["message"]["content"]
        explanation = json.loads(content)

        if not isinstance(explanation.get("recommendation_explanation"), str):
            raise ValueError("Invalid LLM response structure")

        return explanation

    except (
        urllib.error.URLError,
        TimeoutError,
        KeyError,
        json.JSONDecodeError,
        ValueError,
    ):
        return deterministic_fallback(context)


if __name__ == "__main__":
    test_context = {
        "recommended_experiment": "R(+) vs Racemic/S(-) Propranolol Functional Comparison",
        "tests_node": "Beta-Independent Activity",
        "uncertainty": 0.65,
        "downstream_impact": 4,
        "discriminating_power": 0.95,
        "cost": 3,
        "time": 1,
        "score": 0.823,
    }

    print(json.dumps(explain_recommendation(test_context), indent=2))