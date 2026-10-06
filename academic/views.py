import math
from datetime import timedelta

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.shortcuts import redirect, render
from django.utils import timezone

from .forms import ClassScheduleFormSet, SemesterForm
from .models import Semester


def get_active_semester(user):
   
    return (
        Semester.objects.filter(student=user)
        .order_by("-start_date", "-created_at")
        .first()
    )


def build_stats(semester, today):
   
    total_days = (semester.end_date - semester.start_date).days
    elapsed_days = min(max((today - semester.start_date).days, 0), total_days)
    total_weeks = math.ceil(total_days / 7)

    if today < semester.start_date:
        phase, current_week = "upcoming", 0
    elif today > semester.end_date:
        phase, current_week = "ended", total_weeks
    else:
        phase = "running"
        current_week = min(elapsed_days // 7 + 1, total_weeks)

    return {
        "phase": phase,  # upcoming | running | ended
        "progress": round(elapsed_days / total_days * 100),
        "current_week": current_week,
        "total_weeks": total_weeks,
        "total_days": total_days,
        "days_elapsed": elapsed_days,
        "days_remaining": max((semester.end_date - today).days, 0),
        "days_until_start": max((semester.start_date - today).days, 0),
    }


def get_todays_classes(schedules, today, now_time, stats):
    
    if stats["phase"] != "running":
        return []

    todays = [s for s in schedules if s.day_of_week == today.weekday()]
    for item in todays:
        if now_time < item.start_time:
            item.status = "upcoming"
        elif now_time < item.end_time:
            item.status = "ongoing"
        else:
            item.status = "completed"
    return todays


def get_current_status(stats, todays_classes):
   
    if stats["phase"] == "upcoming":
        return {"kind": "upcoming", "title": "Semester not started", "schedule": None}
    if stats["phase"] == "ended":
        return {"kind": "ended", "title": "Semester ended", "schedule": None}

    for item in todays_classes:
        if item.status == "ongoing":
            return {"kind": "class", "title": item.course_name, "schedule": item}

    return {"kind": "regular", "title": "Regular classes", "schedule": None}


def build_timeline(semester, today, stats, status):
   
    events = [{"kind": "start", "label": "Semester start", "date": semester.start_date}]

    for week in range(2, stats["total_weeks"] + 1):
        week_start = semester.start_date + timedelta(weeks=week - 1)
        if week_start < semester.end_date:
            events.append({"kind": "week", "label": f"Week {week} begins", "date": week_start})

    events.append({"kind": "end", "label": "Semester end", "date": semester.end_date})

    now_item = {
        "kind": "now",
        "state": "current",
        "label": status["title"],
        "date": today,
        "schedule": status["schedule"],
    }

    items = []
    now_placed = False
    for event in events:
        if not now_placed and event["date"] > today:
            items.append(now_item)
            now_placed = True
        event["state"] = "past" if event["date"] <= today else "future"
        items.append(event)

    if not now_placed:  # today is after the semester end
        items.append(now_item)

    return items


def group_routine(schedules):
    
    days = {}
    ordered = sorted(schedules, key=lambda s: (s.week_order, s.start_time))
    for item in ordered:
        days.setdefault(item.get_day_of_week_display(), []).append(item)
    return list(days.items())


@login_required
def home(request):
    semester = get_active_semester(request.user)

    # State A: no semester yet
    if semester is None:
        return render(request, "academic/home.html", {"semester": None})

    now = timezone.localtime()
    today = now.date()

    schedules = list(semester.class_schedules.all())
    stats = build_stats(semester, today)
    todays_classes = get_todays_classes(schedules, today, now.time(), stats)
    status = get_current_status(stats, todays_classes)

    context = {
        "semester": semester,
        "today": today,
        "stats": stats,
        "status": status,
        "has_routine": bool(schedules),
        "routine_days": group_routine(schedules),
        "todays_classes": todays_classes,
        "timeline": build_timeline(semester, today, stats, status),
    }
    return render(request, "academic/home.html", context)


@login_required
def semester_setup(request):
    if request.method == "POST":
        semester_form = SemesterForm(request.POST)
        routine_formset = ClassScheduleFormSet(request.POST)

        # Validate both so every error shows at once
        semester_ok = semester_form.is_valid()
        routine_ok = routine_formset.is_valid()

        if semester_ok and routine_ok:
            with transaction.atomic():
                semester = semester_form.save(commit=False)
                semester.student = request.user
                semester.save()

                routine_formset.instance = semester
                routine_formset.save()

            messages.success(request, "Your semester is ready.")
            return redirect("academic:home")
    else:
        semester_form = SemesterForm()
        routine_formset = ClassScheduleFormSet()

    return render(request, "academic/semester_setup.html", {
        "semester_form": semester_form,
        "routine_formset": routine_formset,
    })