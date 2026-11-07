DIFFICULTIES = ["beginner", "intermediate", "advanced"]
DIFFICULTY_POINTS = {"beginner": 1, "intermediate": 2, "advanced": 3}


def next_difficulty(current, is_correct):
    index = DIFFICULTIES.index(current)
    if is_correct:
        index = min(index + 1, len(DIFFICULTIES) - 1)
    else:
        index = max(index - 1, 0)
    return DIFFICULTIES[index]


def weighted_percentage(questions):
    total_weight = 0
    earned_weight = 0
    for question in questions:
        weight = DIFFICULTY_POINTS[question.difficulty]
        total_weight += weight
        if question.is_correct:
            earned_weight += weight
    if not total_weight:
        return 0
    return round((earned_weight / total_weight) * 100, 2)
