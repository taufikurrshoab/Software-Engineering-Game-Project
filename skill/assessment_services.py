import json
import os

from django.conf import settings
from groq import Groq


QUESTION_SCHEMA = {
    "type": "object",
    "properties": {
        "topic": {"type": "string"},
        "question": {"type": "string"},
        "options": {
            "type": "array",
            "items": {"type": "string"},
        },
        "correct_index": {"type": "integer"},
        "explanation": {"type": "string"},
    },
    "required": ["topic", "question", "options", "correct_index", "explanation"],
}


def generate_question(skill, difficulty, previous_questions=None):
    """
    Generate and validate one MCQ using Groq's Chat Completions API.

    Uses JSON mode for broad model compatibility, then validates the returned
    structure locally before the question is stored.
    """
    api_key = getattr(settings, "GROQ_API_KEY", "") or os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is missing. Add your Groq API key to the .env file."
        )

    model = getattr(settings, "GROQ_MODEL", "openai/gpt-oss-120b")
    previous_questions = previous_questions or []

    system_prompt = """
You are a careful technical assessment author.
Return only valid JSON. Do not include markdown fences or commentary.
Create original, accurate, unambiguous multiple-choice questions.
Exactly one answer must be correct. The correct_index is zero-based.
"""

    user_prompt = f"""
Create ONE multiple-choice assessment question.

Skill: {skill}
Difficulty: {difficulty}

Requirements:
- Exactly four distinct answer options.
- Exactly one unambiguously correct answer.
- correct_index must be an integer from 0 to 3.
- Include a concise topic label and a short explanation.
- Test practical understanding, not trivia.
- For programming skills, use valid code when appropriate.
- Avoid repeating these previous question texts:
{json.dumps(previous_questions, ensure_ascii=False)}

Return a JSON object with exactly these fields:
{{
  "topic": "short topic label",
  "question": "question text",
  "options": ["option 1", "option 2", "option 3", "option 4"],
  "correct_index": 0,
  "explanation": "short explanation"
}}
"""

    client = Groq(api_key=api_key)
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.4,
            max_tokens=1200,
        )
        content = completion.choices[0].message.content
        if not content:
            raise RuntimeError("Groq returned an empty response.")

        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Groq returned invalid JSON. Please retry.") from exc

    except Exception as exc:
        # Keep useful API error details for Django's user-facing error handler.
        raise RuntimeError(f"Groq API request failed: {exc}") from exc
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            close()

    if not isinstance(data, dict):
        raise RuntimeError("Groq returned an invalid question format.")

    topic = data.get("topic", "General")
    question = data.get("question")
    options = data.get("options")
    correct_index = data.get("correct_index")
    explanation = data.get("explanation")

    if not isinstance(question, str) or not question.strip():
        raise RuntimeError("Groq generated an empty question.")

    if not isinstance(options, list) or len(options) != 4:
        raise RuntimeError("Groq must generate exactly four answer options.")

    if not all(isinstance(option, str) and option.strip() for option in options):
        raise RuntimeError("Groq generated an invalid answer option.")

    if len({option.strip() for option in options}) != 4:
        raise RuntimeError("Groq generated duplicate answer options.")

    if (
        not isinstance(correct_index, int)
        or isinstance(correct_index, bool)
        or correct_index not in range(4)
    ):
        raise RuntimeError("Groq generated an invalid correct answer index.")

    if not isinstance(explanation, str) or not explanation.strip():
        raise RuntimeError("Groq generated an invalid explanation.")

    return {
        "topic": str(topic)[:100],
        "question": question.strip(),
        "options": [option.strip() for option in options],
        "correct_index": correct_index,
        "explanation": explanation.strip(),
    }
