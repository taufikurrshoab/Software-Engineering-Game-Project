"""AI-powered next-step learning recommendations with a safe local fallback."""
import json
import os

from django.conf import settings
from groq import Groq

from .models import LearningRecommendation

# Used only if the AI service is unavailable or does not return a valid item.
RECOMMENDATIONS = {
    "python": ["Django", "FastAPI", "Data analysis"],
    "html": ["CSS", "Accessibility"],
    "css": ["JavaScript", "Responsive design"],
    "javascript": ["TypeScript", "Node.js", "React"],
    "django": ["REST APIs", "PostgreSQL"],
    "machine learning": ["Deep Learning", "MLOps"],
    "c": ["Data Structures", "Pointers and memory"],
    "data structures": ["Algorithms", "Problem solving"],
    "sql": ["PostgreSQL", "Database indexing"],
    "java": ["Spring Boot", "Multithreading"],
    "php": ["Laravel", "REST APIs"],
    "c++": ["Data Structures", "Object-oriented design"],
}

STARTER_SKILLS = ["Python", "HTML", "CSS", "JavaScript", "C", "SQL"]


def next_skills_for(skill_name):
    """Simple fallback suggestions, retained for the completion banner."""
    return RECOMMENDATIONS.get(skill_name.strip().lower(), [])


def _fallback_items(skill):
    names = next_skills_for(skill.name)
    if not names:
        category_paths = {
            "programming": ["Data Structures", "Object-Oriented Programming", "Testing and Debugging"],
            "web": ["REST APIs", "Responsive Design", "Web Security"],
            "data": ["Statistics", "Data Visualization", "Machine Learning"],
            "cs": ["Algorithms", "Operating Systems", "Computer Networks"],
            "tools": ["Automation", "Git Workflows", "CI/CD"],
            "other": ["Core Concepts", "Practical Projects", "Testing and Debugging"],
        }
        names = category_paths.get(skill.category, category_paths["other"])
    return [
        {"name": name, "reason": f"A practical next step that builds on your {skill.name} learning."}
        for name in names[:3]
    ]


def _valid_items(raw_items, owned_names):
    """Validate and normalize the model output before storing it."""
    if not isinstance(raw_items, list):
        return []
    cleaned, seen = [], set()
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        reason = item.get("reason")
        if not isinstance(name, str) or not name.strip():
            continue
        name = name.strip()[:80]
        key = name.casefold()
        if key in owned_names or key in seen:
            continue
        if not isinstance(reason, str) or not reason.strip():
            reason = f"Build on your {name} knowledge with a practical learning path."
        cleaned.append({"name": name, "reason": reason.strip()[:240]})
        seen.add(key)
        if len(cleaned) == 3:
            break
    return cleaned


def refresh_learning_recommendations(user, skills, force=False):
    """Generate suggestions for skills with no cache or changed proficiency.

    A single Groq request handles all skills needing refresh, then each result is
    persisted. Existing recommendations are reused across ordinary page loads.
    """
    skills = list(skills)
    if not skills:
        return {}

    existing = {
        rec.skill_id: rec
        for rec in LearningRecommendation.objects.filter(user=user, skill__in=skills)
    }
    stale_skills = [
        skill for skill in skills
        if force
        or skill.pk not in existing
        or existing[skill.pk].based_on_progress != skill.progress
    ]

    if stale_skills:
        api_key = getattr(settings, "GROQ_API_KEY", "") or os.getenv("GROQ_API_KEY")
        model = getattr(settings, "GROQ_MODEL", "openai/gpt-oss-120b")
        generated = {}

        if api_key:
            payload = [
                {
                    "skill_id": skill.pk,
                    "skill": skill.name,
                    "category": skill.get_category_display(),
                    "proficiency": skill.progress,
                    "status": skill.get_status_display(),
                    "parent_skill": skill.parent.name if skill.parent_id else None,
                }
                for skill in stale_skills
            ]
            owned_names = [skill.name for skill in skills]
            client = Groq(api_key=api_key)
            try:
                completion = client.chat.completions.create(
                    model=model,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a practical computer-science learning mentor. "
                                "Return only valid JSON. Recommend realistic next skills, "
                                "not generic motivation. Avoid recommending skills the "
                                "learner already owns. Keep each reason concise."
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                "For every skill entry below, recommend 2 or 3 logical "
                                "next skills, ordered from most useful to less urgent. "
                                "Tailor the path to category and proficiency. If proficiency "
                                "is low, suggest foundations; if high, suggest a meaningful "
                                "next step. Each suggestion must have name and reason. "
                                "Return JSON shaped as {\"recommendations\":[{\"skill_id\":1,"
                                "\"items\":[{\"name\":\"Django\",\"reason\":\"...\"}]}]}.\n"
                                f"Existing skills to exclude: {json.dumps(owned_names)}\n"
                                f"Skill entries: {json.dumps(payload, ensure_ascii=False)}"
                            ),
                        },
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.5,
                    max_tokens=1800,
                )
                content = completion.choices[0].message.content or "{}"
                data = json.loads(content)
                rows = data.get("recommendations", []) if isinstance(data, dict) else []
                if isinstance(rows, list):
                    for row in rows:
                        if isinstance(row, dict):
                            raw_id = row.get("skill_id")
                            try:
                                skill_id = int(raw_id)
                            except (TypeError, ValueError):
                                continue
                            generated[skill_id] = row.get("items", [])
            except Exception:
                # Keep the Skill page usable even if Groq is down or rate-limited.
                generated = {}
            finally:
                close = getattr(client, "close", None)
                if callable(close):
                    close()

        owned = {name.casefold() for name in (skill.name for skill in skills)}
        for skill in stale_skills:
            items = _valid_items(generated.get(skill.pk, []), owned)
            if not items:
                items = _valid_items(_fallback_items(skill), owned)
            record, _ = LearningRecommendation.objects.update_or_create(
                user=user,
                skill=skill,
                defaults={"suggestions": items, "based_on_progress": skill.progress},
            )
            existing[skill.pk] = record

    return {
        skill.pk: existing[skill.pk].suggestions
        for skill in skills
        if skill.pk in existing
    }
