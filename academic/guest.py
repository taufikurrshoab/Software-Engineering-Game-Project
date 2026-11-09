"""What a visitor who is not signed in sees.

demo_semester()   an in-memory sample semester for the guest dashboard. It is
                  built from journey.DEMO_SEMESTER, shifted so that "today" is
                  always in the sample's week 12 of 16, and is never read from
                  or written to the database. Plain objects, not model rows.
FEATURE_PREVIEW   short descriptions for the read-only feature preview page.
feature_for()     the home-page feature (title, text, icon, url) for a key.
preview_sample()  a few labelled sample rows for a feature's preview page.

Everything a signed-in user sees comes from their own rows; none of this
module's data is ever mixed into it.
"""

from datetime import time, timedelta
from types import SimpleNamespace

from .journey import DEMO_SEMESTER, home_features

_COURSES = [
    ("Database Systems", "#6366f1", "Dr. Rahman"),
    ("Machine Learning", "#22d3ee", "Dr. Chowdhury"),
    ("Algorithms", "#f59e0b", "Ms. Akter"),
    ("Computer Networks", "#10b981", "Mr. Hasan"),
    ("Software Engineering", "#ec4899", "Dr. Karim"),
]

# weekday (0 = Monday) -> [(course index, start hour, room)]
_WEEK = {
    0: [(0, 9, "301"), (1, 11, "204"), (2, 14, "105")],
    1: [(3, 10, "212"), (4, 13, "108")],
    2: [(0, 9, "301"), (2, 11, "105"), (1, 14, "204")],
    3: [(4, 10, "108"), (3, 12, "212")],
    4: [(1, 9, "204"), (0, 11, "301")],
}


def demo_semester(today):
    """Returns (semester, courses, schedules, pending, holidays) as plain objects."""
    weeks, week = DEMO_SEMESTER["weeks"], DEMO_SEMESTER["week"]
    monday = today - timedelta(days=today.weekday())
    start = monday - timedelta(weeks=week - 1)
    end = start + timedelta(weeks=weeks) - timedelta(days=1)
    semester = SimpleNamespace(name=DEMO_SEMESTER["name"], start_date=start, end_date=end)

    courses = [SimpleNamespace(name=n, color=c, teacher=t) for n, c, t in _COURSES]
    by_name = {c.name: c for c in courses}

    schedules = []
    for day, classes in _WEEK.items():
        for course_index, hour, room in classes:
            course = courses[course_index]
            schedules.append(SimpleNamespace(
                day_of_week=day, course=course, course_name=course.name, room=room,
                start_time=time(hour, 0), end_time=time(hour + 1, 15),
            ))

    pending = []
    for number, item in enumerate(DEMO_SEMESTER["deadlines"], start=1):
        due = start + timedelta(weeks=item["week"] - 1, days=4)      # the Friday of that week
        pending.append(SimpleNamespace(
            pk=number, title=item["title"], due_date=due, description="",     # distinct: they become anchors
            course=by_name[item["course"]],
        ))
    pending.sort(key=lambda a: a.due_date)

    break_start = start + timedelta(weeks=13)                         # Monday of week 14
    holidays = [SimpleNamespace(
        pk=1, title="Study break", start_date=break_start, end_date=break_start + timedelta(days=2),
    )]
    return semester, courses, schedules, pending, holidays


FEATURE_PREVIEW = {
    "semester": [
        "Name the semester and set its start and end dates.",
        "Keep several semesters and switch the active one at any time.",
        "Every other feature hangs off the active semester.",
    ],
    "courses": [
        "Add each course with its code, credit hours and teacher.",
        "Give a course a colour that follows it across the whole app.",
        "Record the grade you earn and see it feed your GPA.",
    ],
    "routine": [
        "Lay out your weekly classes by day, time and room.",
        "Cancel a single class without changing the weekly pattern, and restore it later.",
        "Today's classes appear on your dashboard automatically.",
    ],
    "assignments": [
        "Add assignments with a course, a due date and notes.",
        "Tick work off as you finish it; overdue items are flagged.",
        "The nearest deadlines show on your dashboard and journey.",
    ],
    "attendance": [
        "Classes are counted as they happen, no manual set-up each day.",
        "Mark absences, late arrivals and excused days.",
        "See attendance per course and for the whole semester.",
    ],
    "holidays": [
        "Add breaks and holidays with a date range.",
        "Classes that fall on a holiday never count against your attendance.",
        "Upcoming holidays show on the semester journey.",
    ],
    "timeline": [
        "Classes, deadlines and holidays laid out week by week.",
        "Look back at past weeks or ahead at what is coming.",
        "Built from your own routine, assignments and holidays.",
    ],
    "cgpa": [
        "Record the GPA of every semester, with its credits.",
        "See a credit-weighted CGPA and how it changes over time.",
        "Get plain-language advice based on the results you recorded.",
    ],
}
# "Analyse Performance" is the same page as "Track Semester GPA"
FEATURE_PREVIEW["analysis"] = FEATURE_PREVIEW["cgpa"]


def feature_for(key):
    for feature in home_features():
        if feature["key"] == key:
            return feature
    return None


# ---------------------------------------------------------------- preview rows

_DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
# (course index, classes held, classes attended): 92 of 100 overall, matching DEMO_SEMESTER
_ATTENDANCE = [(0, 25, 23), (1, 20, 18), (2, 20, 19), (3, 18, 17), (4, 17, 15)]
_GPA_HISTORY = [("Year 1, Semester 1", "3.55"), ("Year 1, Semester 2", "3.70"), ("Year 2, Semester 1", "3.80"),
                ("Year 2, Semester 2", "3.85"), ("Year 3, Semester 1", "3.85")]


def preview_sample(key, today):
    """Sample rows for a feature's preview page, or None when there is nothing to show.

    Built in memory from demo_semester(), never from the database. Each row is
    {"title", "meta", "color", "dom_id"}; dom_id matches the journey anchors.
    """
    semester, courses, schedules, pending, holidays = demo_semester(today)
    rows = []
    if key == "semester":
        rows.append(_row(semester.name, f"{semester.start_date:%d %b %Y} \u2013 {semester.end_date:%d %b %Y} "
                                         f"\u00b7 week {DEMO_SEMESTER['week']} of {DEMO_SEMESTER['weeks']}"))
    elif key == "courses":
        rows = [_row(c.name, c.teacher, c.color) for c in courses]
    elif key == "routine":
        for s in sorted(schedules, key=lambda s: (s.day_of_week, s.start_time)):
            rows.append(_row(s.course_name, f"{_DAYS[s.day_of_week]} {s.start_time:%H:%M}\u2013{s.end_time:%H:%M} "
                                            f"\u00b7 Room {s.room}", s.course.color))
    elif key == "assignments":
        for a in pending:
            rows.append(_row(a.title, f"{a.course.name} \u00b7 due {a.due_date:%a, %d %b}", a.course.color,
                             f"assignment-{a.pk}"))
    elif key == "holidays":
        for h in holidays:
            rows.append(_row(h.title, f"{h.start_date:%d %b} \u2013 {h.end_date:%d %b}", "", f"holiday-{h.pk}"))
    elif key == "attendance":
        for index, held, attended in _ATTENDANCE:
            rows.append(_row(courses[index].name, f"{round(attended / held * 100)}% present \u00b7 {attended} of {held} classes",
                             courses[index].color))
    elif key == "timeline":
        for day in range(5):
            count = sum(1 for s in schedules if s.day_of_week == day)
            rows.append(_row(_DAYS[day], f"{count} classes"))
    elif key in ("cgpa", "analysis"):
        rows = [_row(name, f"GPA {gpa}") for name, gpa in _GPA_HISTORY]
        rows.append(_row("CGPA", f"{DEMO_SEMESTER['cgpa']} (credit-weighted)"))
    return rows or None


def _row(title, meta, color="", dom_id=""):
    return {"title": title, "meta": meta, "color": color, "dom_id": dom_id}
