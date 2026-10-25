# Predefined next-skill suggestions, matched by lowercase skill name.
# These are only suggestions. Nothing is added automatically.
RECOMMENDATIONS = {
    "python": ["Django", "Machine Learning"],
    "html": ["CSS"],
    "css": ["JavaScript"],
    "javascript": ["TypeScript", "Node.js"],
    "django": ["REST APIs"],
    "machine learning": ["Deep Learning"],
    "c": ["Data Structures"],
    "data structures": ["Algorithms"],
    "sql": ["PostgreSQL"],
}

# Quick-start ideas shown on the welcome page
STARTER_SKILLS = ["Python", "HTML", "CSS", "JavaScript", "C", "SQL"]


def next_skills_for(skill_name):
    return RECOMMENDATIONS.get(skill_name.strip().lower(), [])