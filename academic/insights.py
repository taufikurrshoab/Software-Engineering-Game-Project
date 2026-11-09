"""Semester-wise GPA history, CGPA across semesters and rule-based advice.

Everything here is plain Python over the saved records: no database access, no
external service. The advice is produced by explicit rules (thresholds below),
and a rule only fires when the data is there to support it. A future AI
recommender could replace or extend `analyse()` without touching the views.

Terms
    Semester GPA   performance in one semester (SemesterGPA.gpa)
    CGPA           credit-weighted across semesters:
                       sum(gpa * credits) / sum(credits)
                   calculated only when EVERY record has credits. Credits are
                   never assumed equal; the plain average is shown separately
                   and labelled as an average.
"""

from decimal import ROUND_HALF_UP, Decimal

TWO_PLACES = Decimal("0.01")

STABLE_STEP = Decimal("0.05")        # a change smaller than this counts as "about the same"
CONSISTENT_RANGE = Decimal("0.20")   # best - worst within this => "consistent"
MIN_TREND_RECORDS = 3                # fewer records: no trend, no trend-based advice
TREND_WINDOW = 4                     # the trend looks at the most recent N semesters
ATTENDANCE_TARGET = 75               # same target the attendance page uses
GPA_SCALE_MAX = Decimal("4")         # upper bound of a GPA (also enforced by the model)


def q2(value):
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def fmt(value):
    return f"{value:.2f}"


def plural(count, word):
    return f"{count} {word}{'' if count == 1 else 's'}"


# ----------------------------------------------------------------- history

def history_entries(records):
    """Ordered semester records with the change from the previous semester."""
    entries = []
    previous = None
    for record in records:
        entry = {
            "record": record,
            "name": record.name,
            "term": record.term,
            "gpa": record.gpa,
            "credits": record.credits,
            "delta": None,
            "direction": None,   # up | down | same (None for the first record)
        }
        if previous is not None:
            delta = q2(record.gpa - previous.gpa)
            entry["delta"] = delta
            if delta >= STABLE_STEP:
                entry["direction"] = "up"
            elif delta <= -STABLE_STEP:
                entry["direction"] = "down"
            else:
                entry["direction"] = "same"
        entries.append(entry)
        previous = record
    return entries


def next_term(records):
    terms = [record.term for record in records]
    return (max(terms) + 1) if terms else 1


def history_summary(entries):
    """Average GPA, best semester and (when every record has credits) the CGPA."""
    count = len(entries)
    summary = {
        "count": count,
        "average": None,
        "cgpa": None,
        "credits": None,
        "missing_credits": 0,
        "best": None,
        "latest": None,
    }
    if not count:
        return summary

    summary["average"] = q2(sum(e["gpa"] for e in entries) / count)
    summary["missing_credits"] = sum(1 for e in entries if not e["credits"])
    if summary["missing_credits"] == 0:
        total = sum(e["credits"] for e in entries)
        summary["credits"] = total
        summary["cgpa"] = q2(sum(e["gpa"] * e["credits"] for e in entries) / total)
    # ties: prefer the most recent semester
    summary["best"] = max(entries, key=lambda e: (e["gpa"], e["term"]))
    summary["latest"] = entries[-1]
    return summary


def suggestions(course_summary, entries):
    """Semesters that have course grades but no semester record yet.

    `course_summary` is services.cgpa_summary(); the GPA shown is the one the
    backend already calculated from the course grades (it is only offered as a
    starting point the student can save, never recalculated here).
    """
    recorded = {e["name"].casefold() for e in entries}
    result = []
    for row in course_summary["semesters"]:
        if row["semester"].name.casefold() in recorded:
            continue
        result.append({
            "name": row["semester"].name,
            "gpa": row["gpa"],
            "credits": row["credits"],
            "courses": row["courses"],
        })
    return result


def grade_distribution(rows):
    """How many courses got each letter grade (rows = [(course, grade or None)])."""
    buckets = {}
    for _course, grade in rows:
        if not grade:
            continue
        key = grade.grade.strip().upper()
        bucket = buckets.setdefault(key, {"grade": key, "point": grade.grade_point, "count": 0})
        bucket["count"] += 1
        bucket["point"] = max(bucket["point"], grade.grade_point)
    ordered = sorted(buckets.values(), key=lambda b: (-b["point"], b["grade"]))
    biggest = max((b["count"] for b in ordered), default=0)
    for bucket in ordered:
        bucket["fill"] = round(bucket["count"] / biggest * 100) if biggest else 0
    return ordered


# ---------------------------------------------------------------- analysis

def _streak(entries):
    """(direction, length) of the run of rises or falls that ends at the latest record."""
    if len(entries) < 2 or entries[-1]["direction"] not in ("up", "down"):
        return None, 0
    direction = entries[-1]["direction"]
    length = 0
    for entry in reversed(entries):
        if entry["direction"] != direction:
            break
        length += 1
    return direction, length


def _slope(values):
    """Least-squares slope (GPA change per semester) of equally spaced values."""
    n = len(values)
    mean_x = Decimal(n - 1) / 2
    mean_y = sum(values) / n
    numerator = sum((Decimal(i) - mean_x) * (v - mean_y) for i, v in enumerate(values))
    denominator = sum((Decimal(i) - mean_x) ** 2 for i in range(n))
    return numerator / denominator


def _trend(entries):
    """improving | stable | declining, or None when there is not enough data.

    Uses the slope of the most recent semesters, so one earlier dip does not
    hide a real recovery (and one good semester does not hide a decline).
    """
    if len(entries) < MIN_TREND_RECORDS:
        return None
    slope = _slope([e["gpa"] for e in entries[-TREND_WINDOW:]])
    if slope >= STABLE_STEP:
        return "improving"
    if slope <= -STABLE_STEP:
        return "declining"
    return "stable"


def _course_advice(graded_rows):
    graded = [(course, grade) for course, grade in graded_rows if grade]
    if len(graded) < 2:
        return None
    lowest = min(graded, key=lambda item: (item[1].grade_point, -item[0].credit))
    highest = max(grade.grade_point for _course, grade in graded)
    if lowest[1].grade_point >= highest:
        return None   # every course has the same grade point: nothing to single out
    course, grade = lowest
    return (
        f"Your lowest grade this semester is {grade.grade} in {course.name} "
        f"({plural(int(course.credit) if course.credit == int(course.credit) else course.credit, 'credit')}). "
        "Extra revision there could lift your GPA."
    )


def analyse(entries, summary, graded_rows=(), attendance_percentage=None):
    """Observations (what the data shows) and advice (what to do about it).

    Returns {"trend", "trend_label", "enough", "observations", "advice"}; each
    message is {"tone": good | warn | info, "text": str}.
    """
    count = len(entries)
    trend = _trend(entries)
    direction, run = _streak(entries)
    observations = []
    advice = []

    def say(target, tone, text):
        target.append({"tone": tone, "text": text})

    # --- observations: only statements the records support
    if count >= 2:
        latest, previous = entries[-1], entries[-2]
        change = fmt(abs(latest["delta"]))
        if latest["direction"] == "up":
            say(observations, "good", f"Your GPA rose by {change} compared with {previous['name']}.")
        elif latest["direction"] == "down":
            say(observations, "warn", f"Your GPA dropped by {change} compared with {previous['name']}.")
        else:
            say(observations, "info", f"Your GPA stayed about the same as {previous['name']} ({fmt(previous['gpa'])}).")

        if run >= 2:
            if direction == "up":
                say(observations, "good", f"Your GPA has improved for {run} consecutive semesters.")
            else:
                say(observations, "warn", f"Your GPA has declined for {run} consecutive semesters.")

        best = summary["best"]
        if best is entries[-1]:
            say(observations, "good", f"Your strongest semester so far is your latest one, {best['name']} ({fmt(best['gpa'])}).")
        else:
            say(observations, "info", f"Your strongest semester was {best['name']} ({fmt(best['gpa'])}).")
        say(observations, "info", f"Your average semester GPA is {fmt(summary['average'])} across {count} semesters.")

    if count >= MIN_TREND_RECORDS:
        gpas = [e["gpa"] for e in entries]
        if max(gpas) - min(gpas) <= CONSISTENT_RANGE:
            say(observations, "good", f"Your results are consistent: every semester is within {fmt(CONSISTENT_RANGE)} of the others.")
        label = {"improving": "improving", "stable": "stable", "declining": "declining"}[trend]
        tone = {"improving": "good", "stable": "info", "declining": "warn"}[trend]
        say(observations, tone, f"Your recent academic trend is {label}.")

    # --- advice: explicit rules
    if count == 0:
        say(advice, "info", "Add your first semester GPA to start tracking your academic performance.")
    elif count < MIN_TREND_RECORDS:
        missing = MIN_TREND_RECORDS - count
        say(advice, "info",
            f"You have not entered enough semester records yet. Add {plural(missing, 'more result')} "
            "to receive a meaningful trend analysis.")
    else:
        latest_dropped = entries[-1]["direction"] == "down"
        if trend == "improving":
            if direction == "up" and run >= 2:
                say(advice, "good", f"Your GPA has improved for {run} consecutive semesters. Keep following your current study routine.")
            else:
                say(advice, "good", "Your recent trend is improving. Keep the habits that are working for you.")
        elif trend == "declining":
            say(advice, "warn",
                "Your GPA has been declining recently. Think about what changed (workload, attendance, study routine) "
                "and review the courses where your grades were lower.")
        else:
            say(advice, "info", "Your performance is stable, but you may improve by focusing on courses with lower grades.")
        if latest_dropped and trend != "declining":
            say(advice, "warn", "Your GPA dipped this semester. Review the courses where your grades were lower.")

    course_note = _course_advice(graded_rows)
    if course_note:
        say(advice, "info", course_note)

    if attendance_percentage is not None and attendance_percentage < ATTENDANCE_TARGET:
        say(advice, "warn",
            f"Your attendance this semester is {attendance_percentage}%, below the {ATTENDANCE_TARGET}% target. "
            "Regular attendance usually protects your grades.")

    if count and summary["missing_credits"]:
        say(advice, "info",
            f"Add credits to {plural(summary['missing_credits'], 'semester record')} "
            "to calculate a credit-weighted CGPA.")

    return {
        "trend": trend,
        "trend_label": trend.capitalize() if trend else None,
        "enough": count >= MIN_TREND_RECORDS,
        "observations": observations,
        "advice": advice,
    }
