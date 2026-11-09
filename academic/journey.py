"""Presentation data for the animated timelines.

build_journey()   the dashboard's semester journey. Every date, week number and
                  deadline is derived from the semester and the saved
                  assignments and holidays; nothing is hardcoded.
home_features()   the nine feature branches on the Academic home page, with the
                  SVG geometry already worked out so the template only loops.
DEMO_SEMESTER     clearly labelled sample numbers for the home page preview.
                  They are constants: never read from, or written to, the database.

Plain Python, no database access: the views pass in what is needed.
"""

from datetime import timedelta

# Order of events that fall on the same day
_KIND_ORDER = {"start": 0, "half": 1, "holiday": 2, "assignment": 3, "empty": 4, "end": 5}

MAX_DEADLINES = 3
MAX_HOLIDAYS = 2


# ---------------------------------------------------------------- journey

def _relative(day, today):
    delta = (day - today).days
    if delta == 0:
        return "Today"
    if delta == 1:
        return "Tomorrow"
    if delta == -1:
        return "Yesterday"
    if delta > 0:
        return f"In {delta} days"
    return f"{-delta} days ago"


def _remaining(day, today):
    """Wording for a deadline."""
    delta = (day - today).days
    if delta < 0:
        return f"Overdue by {-delta} day{'' if delta == -1 else 's'}"
    if delta == 0:
        return "Due today"
    if delta == 1:
        return "Due tomorrow"
    return f"Due in {delta} days"


def _week_of(semester, total_weeks, day):
    weeks = (day - semester.start_date).days // 7 + 1
    return max(1, min(weeks, total_weeks))


def _milestone_state(day, today):
    if day < today:
        return "past"
    return "current" if day == today else "upcoming"


def _pick_deadlines(pending, today):
    """A few deadlines: one overdue (if any) first, then the soonest upcoming."""
    overdue = [a for a in pending if a.due_date < today]
    upcoming = [a for a in pending if a.due_date >= today]
    chosen = overdue[:1] + upcoming[: MAX_DEADLINES - len(overdue[:1])]
    if len(chosen) < MAX_DEADLINES:
        chosen += overdue[1: 1 + MAX_DEADLINES - len(chosen)]
    return chosen


def _now_position(dates, today):
    """Where "today" sits on the line, as a percentage.

    Events are spread evenly along the line so nothing crowds together; "today"
    is placed between its neighbouring events in proportion to the real dates.
    """
    count = len(dates)
    if today < dates[0]:
        return 0.0
    if today > dates[-1]:
        return 100.0
    index = max(i for i, day in enumerate(dates) if day <= today)
    if index == count - 1:
        return (index + 0.5) / count * 100
    span = (dates[index + 1] - dates[index]).days
    fraction = (today - dates[index]).days / span if span else 0
    return (index + 0.5 + fraction) / count * 100


def build_journey(semester, today, stats, pending, holidays):
    """The dashboard timeline: the semester as a line, academic events as branches.

    stats     views.build_stats() for the semester
    pending   incomplete assignments, soonest first (each with a .course)
    holidays  the semester's holidays
    """
    total_weeks = stats["total_weeks"]
    start, end = semester.start_date, semester.end_date
    half = start + timedelta(days=(end - start).days // 2)

    def milestone(kind, day, title, detail, more):
        return {
            "kind": kind, "title": title, "date": day, "end_date": None,
            "sort_date": day, "week": _week_of(semester, total_weeks, day),
            "state": _milestone_state(day, today), "relative": _relative(day, today),
            "detail": detail, "more": more,
        }

    if stats["phase"] == "running":
        weeks_done, weeks_left = stats["current_week"] - 1, total_weeks - stats["current_week"]
    elif stats["phase"] == "ended":
        weeks_done, weeks_left = total_weeks, 0
    else:
        weeks_done, weeks_left = 0, total_weeks
    progress_line = f"{weeks_done} week{'' if weeks_done == 1 else 's'} done, {weeks_left} to go"

    events = [
        milestone("start", start, "Semester starts", f"Week 1 · {start:%a, %d %b}", ["The first day of the semester."]),
        milestone("half", half, "Halfway point", f"Week {_week_of(semester, total_weeks, half)} · {half:%a, %d %b}",
                  [f"The middle of the semester, {(half - start).days} days in."]),
        milestone("end", end, "Semester ends",
                  f"Week {_week_of(semester, total_weeks, end)} · {end:%a, %d %b}",
                  [f"{max((end - today).days, 0)} days remaining." if end >= today else "The semester is complete."]),
    ]

    chosen = _pick_deadlines(pending, today)
    for assignment in chosen:
        due = assignment.due_date
        events.append({
            "kind": "assignment", "title": assignment.title, "date": due, "end_date": None,
            "sort_date": due, "week": _week_of(semester, total_weeks, due),
            "state": "overdue" if due < today else ("current" if due == today else "upcoming"),
            "relative": _remaining(due, today),
            "detail": assignment.course.name, "course": assignment.course.name,
            "color": assignment.course.color, "anchor": f"#assignment-{assignment.pk}",
            "more": [assignment.description.strip()[:140]] if assignment.description.strip() else [f"Due {due:%A, %d %B}"],
        })

    if not pending:
        # a subtle empty branch, sitting where "today" is
        events.append({
            "kind": "empty", "title": "No deadlines due", "date": None, "end_date": None,
            "sort_date": today, "week": None, "state": "ghost", "relative": "",
            "detail": "You're all caught up", "more": [],
        })

    upcoming_holidays = sorted(
        (h for h in holidays if h.end_date >= today and h.end_date >= start and h.start_date <= end),
        key=lambda h: h.start_date,
    )[:MAX_HOLIDAYS]
    for holiday in upcoming_holidays:
        length = (holiday.end_date - holiday.start_date).days + 1
        ongoing = holiday.start_date <= today
        events.append({
            "kind": "holiday", "title": holiday.title, "date": holiday.start_date, "end_date": holiday.end_date,
            "sort_date": holiday.start_date, "week": _week_of(semester, total_weeks, holiday.start_date),
            "state": "current" if ongoing else "upcoming",
            "relative": "Happening now" if ongoing else _relative(holiday.start_date, today),
            "detail": f"{holiday.start_date:%d %b}" + (f" – {holiday.end_date:%d %b}" if length > 1 else ""),
            "anchor": f"#holiday-{holiday.pk}",
            "more": [f"No classes · {length} day{'' if length == 1 else 's'}"],
        })

    events.sort(key=lambda e: (e["sort_date"], _KIND_ORDER[e["kind"]]))
    count = len(events)
    for index, event in enumerate(events):
        event["index"] = index
        event["side"] = "up" if index % 2 == 0 else "down"

    now = _now_position([e["sort_date"] for e in events], today)
    if stats["phase"] == "ended":
        now = 100.0   # the whole line is complete, whatever sits at today's date
    if stats["phase"] == "running":
        now_label = f"Today · Week {stats['current_week']}"
    elif stats["phase"] == "upcoming":
        now_label = f"Starts in {stats['days_until_start']} day{'' if stats['days_until_start'] == 1 else 's'}"
    else:
        now_label = "Semester complete"

    return {
        "events": events,
        "count": count,
        "now": round(now, 1),
        "now_label": now_label,
        "weeks_done": weeks_done,
        "weeks_left": weeks_left,
        "progress_line": progress_line,
        "more_pending": max(len(pending) - len(chosen), 0),
        "has_deadlines": bool(pending),
    }


# ------------------------------------------------------------------- home

_FEATURES = [
    ("semester", "Add Semester", "layers", "academic:setup", "",
     "Name your semester and set its start and end dates. Everything else in Academic hangs off it."),
    ("courses", "Add Courses", "book", "academic:course_list", "",
     "Add each course with its code, credit, teacher and a colour that follows it everywhere."),
    ("routine", "Manage Routine", "clock", "academic:routine_list", "",
     "Build your weekly class routine. Cancel a single class without touching the rest."),
    ("assignments", "Track Assignments", "clipboard", "academic:assignment_list", "",
     "Keep every deadline in one place and tick assignments off. Overdue work is flagged."),
    ("attendance", "Record Attendance", "check", "academic:attendance_overview", "",
     "Classes are counted as they happen. Mark absences, late arrivals and excused days."),
    ("holidays", "Manage Holidays", "sun", "academic:holiday_list", "",
     "Add breaks and holidays so classes on those days never count against you."),
    ("timeline", "View Timeline", "calendar", "academic:timeline", "",
     "See classes, deadlines and holidays laid out week by week, past and upcoming."),
    ("cgpa", "Track Semester GPA", "award", "academic:cgpa", "#semesters",
     "Record your GPA for every semester and see your credit-weighted CGPA."),
    ("analysis", "Analyse Performance", "chart", "academic:cgpa", "#semesters",
     "Trend charts and plain-language advice based on the results you have recorded."),
]

HOME_VIEWBOX = (1200, 460)
_MAIN_Y = 230
_STEP = 126
_FIRST_X = 96
_REACH = 130   # how far a branch grows from the main line


def home_features():
    """The feature branches, with SVG path data for the branching timeline."""
    result = []
    for index, (key, title, icon, url_name, anchor, text) in enumerate(_FEATURES):
        x = _FIRST_X + index * _STEP
        up = index % 2 == 0
        sign = -1 if up else 1
        lean = 34 if (index // 2) % 2 == 0 else -34
        end_x, end_y = x + lean, _MAIN_Y + sign * _REACH
        path = (
            f"M{x} {_MAIN_Y} C{x} {_MAIN_Y + sign * 50} {end_x} {end_y - sign * 50} {end_x} {end_y}"
        )
        twig_x = x + round(lean * 0.55)
        twig_y = _MAIN_Y + sign * 88
        twig_dx = -30 if lean > 0 else 30
        twig = f"M{twig_x} {twig_y} q{twig_dx // 2} {sign * 4} {twig_dx} {sign * 30}"
        result.append({
            "key": key, "title": title, "icon": icon, "text": text,
            "url_name": url_name, "anchor": anchor, "index": index,
            "x": x, "main_y": _MAIN_Y, "end_x": end_x, "end_y": end_y,
            "path": path, "twig": twig,
            "icon_x": end_x - 11, "icon_y": end_y - 11,
            "label_y": end_y + sign * 44,
            "side": "up" if up else "down",
        })
    return result


DEMO_SEMESTER = {
    "name": "3rd Year, 2nd Semester",
    "weeks": 16,
    "week": 12,
    "courses": 5,
    "weekly_classes": 12,
    "attendance": 92,
    "pending": 2,
    "cgpa": "3.75",
    "deadlines": [
        {"title": "Database ER diagram", "course": "Database Systems", "week": 13},
        {"title": "Lab report 4", "course": "Machine Learning", "week": 15},
    ],
}
