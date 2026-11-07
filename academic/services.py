"""Plain helpers for the Academic views: sessions, attendance, timeline and GPA."""

from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import Attendance, ClassSession, CourseGrade


# ---------------------------------------------------------------- holidays

def get_holidays(semester):
    return list(semester.holidays.all())


def holiday_for(day, holidays):
    """Return the holiday covering `day`, or None."""
    for holiday in holidays:
        if holiday.start_date <= day <= holiday.end_date:
            return holiday
    return None


# ---------------------------------------------------------------- sessions

def occurrences(schedule, start, end):
    """Every date between start and end (inclusive) on the schedule's weekday."""
    day = start + timedelta(days=(schedule.day_of_week - start.weekday()) % 7)
    while day <= end:
        yield day
        day += timedelta(days=7)


def sync_sessions(semester, now=None):
    """Make the database match the routine up to today. Safe to call repeatedly.

    1. Creates a ClassSession for every past routine occurrence (not on holidays).
    2. Creates a Present attendance record for every class that has ended.
    Existing sessions and attendance records are never changed, so cancelled
    classes and manual Absent/Late/Excused marks are kept.
    """
    now = timezone.localtime(now) if now else timezone.localtime()
    last_day = min(now.date(), semester.end_date)
    if last_day < semester.start_date:
        return

    holidays = get_holidays(semester)
    existing = set(
        ClassSession.objects.filter(semester=semester, weekly_class__isnull=False)
        .values_list("weekly_class_id", "date")
    )

    missing = []
    for schedule in semester.class_schedules.all():
        if schedule.course_id is None:
            continue
        for day in occurrences(schedule, semester.start_date, last_day):
            if (schedule.pk, day) in existing or holiday_for(day, holidays):
                continue
            missing.append(ClassSession(
                semester=semester,
                course_id=schedule.course_id,
                weekly_class=schedule,
                date=day,
                start_time=schedule.start_time,
                end_time=schedule.end_time,
                room=schedule.room,
            ))
    ClassSession.objects.bulk_create(missing, ignore_conflicts=True)

    ended = ClassSession.objects.filter(
        semester=semester, is_cancelled=False, attendance__isnull=True
    ).filter(Q(date__lt=now.date()) | Q(date=now.date(), end_time__lte=now.time()))
    Attendance.objects.bulk_create(
        [Attendance(session=session) for session in ended],  # status defaults to Present
        ignore_conflicts=True,
    )


@transaction.atomic
def cancel_occurrence(schedule, day, reason=""):
    """Cancel one dated class. The weekly routine is left untouched."""
    session, _ = ClassSession.objects.get_or_create(
        weekly_class=schedule,
        date=day,
        defaults={
            "semester_id": schedule.semester_id,
            "course_id": schedule.course_id,
            "start_time": schedule.start_time,
            "end_time": schedule.end_time,
            "room": schedule.room,
        },
    )
    session.is_cancelled = True
    session.cancel_reason = reason
    session.save(update_fields=["is_cancelled", "cancel_reason"])
    Attendance.objects.filter(session=session).delete()  # cancelled classes have none
    return session


def restore_occurrence(schedule, day):
    """Undo a cancellation. Returns how many sessions were restored (0 or 1)."""
    return ClassSession.objects.filter(
        weekly_class=schedule, date=day, is_cancelled=True
    ).update(is_cancelled=False, cancel_reason="")


# --------------------------------------------------------------- attendance

def _summarise(counts):
    # Present + Late count as attended; Excused is left out of the percentage.
    counted = counts["present"] + counts["late"] + counts["absent"]
    attended = counts["present"] + counts["late"]
    percentage = round(attended / counted * 100, 1) if counted else None
    return {**counts, "counted": counted, "attended": attended, "percentage": percentage}


def attendance_stats(semester):
    """Overall and per-course attendance. Cancelled classes and holidays are skipped."""
    holidays = get_holidays(semester)
    blank = {"present": 0, "absent": 0, "late": 0, "excused": 0}
    per_course = {}

    sessions = ClassSession.objects.filter(
        semester=semester, is_cancelled=False, attendance__isnull=False
    ).select_related("attendance")
    for session in sessions:
        if holiday_for(session.date, holidays):
            continue
        counts = per_course.setdefault(session.course_id, dict(blank))
        counts[session.attendance.status] += 1

    overall = dict(blank)
    rows = []
    for course in semester.courses.all():
        counts = per_course.get(course.pk, dict(blank))
        for key in overall:
            overall[key] += counts[key]
        rows.append({"course": course, **_summarise(counts)})
    return {"overall": _summarise(overall), "courses": rows}


# ----------------------------------------------------------------- timeline

def build_semester_timeline(semester, today):
    """Week-by-week data: weeks -> days -> holiday, classes and assignments due."""
    schedules = list(semester.class_schedules.select_related("course").order_by("start_time"))
    holidays = get_holidays(semester)

    due = {}
    for assignment in semester.assignments.select_related("course"):
        due.setdefault(assignment.due_date, []).append(assignment)

    sessions = {
        (s.weekly_class_id, s.date): s
        for s in semester.sessions.filter(weekly_class__isnull=False).select_related("attendance")
    }

    weeks = []
    week_start = semester.start_date
    number = 1
    while week_start <= semester.end_date:
        week_end = min(week_start + timedelta(days=6), semester.end_date)
        days = []
        day = week_start
        while day <= week_end:
            holiday = holiday_for(day, holidays)
            classes = []
            if holiday is None:  # no classes are held on holidays
                for schedule in schedules:
                    if schedule.day_of_week != day.weekday():
                        continue
                    session = sessions.get((schedule.pk, day))
                    source = session or schedule  # a session keeps its own snapshot
                    attendance = getattr(session, "attendance", None)
                    classes.append({
                        "weekly_class": schedule,
                        "session": session,
                        "course": schedule.course,
                        "course_name": schedule.course_name,
                        "start_time": source.start_time,
                        "end_time": source.end_time,
                        "room": source.room,
                        "is_cancelled": bool(session and session.is_cancelled),
                        "cancel_reason": session.cancel_reason if session else "",
                        "attendance_status": attendance.status if attendance else None,
                    })
            days.append({
                "date": day,
                "is_today": day == today,
                "holiday": holiday,
                "classes": classes,
                "assignments": due.get(day, []),
            })
            day += timedelta(days=1)
        weeks.append({"number": number, "start": week_start, "end": week_end, "days": days})
        week_start += timedelta(days=7)
        number += 1
    return weeks


# ---------------------------------------------------------------------- GPA

def calculate_gpa(grades):
    """Credit-weighted GPA: sum(grade_point * credit) / sum(credit).

    Returns (gpa, total_credits); gpa is None when there are no graded credits.
    """
    total_credits = Decimal("0")
    total_points = Decimal("0")
    for grade in grades:
        total_credits += grade.course.credit
        total_points += grade.grade_point * grade.course.credit
    if not total_credits:
        return None, total_credits
    gpa = (total_points / total_credits).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return gpa, total_credits


def cgpa_summary(user):
    """Per-semester GPA and the overall CGPA, calculated from the saved grades."""
    grades = list(
        CourseGrade.objects.filter(course__semester__student=user)
        .select_related("course__semester")
        .order_by("course__semester__start_date", "course__name")
    )
    by_semester = {}
    for grade in grades:
        by_semester.setdefault(grade.course.semester_id, []).append(grade)

    semesters = []
    for items in by_semester.values():
        gpa, credits = calculate_gpa(items)
        semesters.append({
            "semester": items[0].course.semester,
            "gpa": gpa,
            "credits": credits,
            "courses": len(items),
        })

    cgpa, credits = calculate_gpa(grades)
    return {
        "semesters": semesters,
        "cgpa": cgpa,
        "credits": credits,
        "courses": len(grades),
    }