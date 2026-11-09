import math
from datetime import timedelta
from functools import wraps

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import RestrictedError
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST
from django.db.models import Count, Q, RestrictedError, Sum
from .forms import (
    AssignmentForm,
    AttendanceForm,
    CancelClassForm,
    ClassScheduleForm,
    CourseForm,
    CourseGradeForm,
    HolidayForm,
    SemesterForm,
    SemesterGPAForm,
)
from .models import (
    Assignment,
    Attendance,
    ClassSchedule,
    ClassSession,
    Course,
    CourseGrade,
    Holiday,
    Semester,
    SemesterGPA,
)
from .insights import (
    analyse,
    grade_distribution,
    history_entries,
    history_summary,
    next_term,
    suggestions,
)
from .journey import DEMO_SEMESTER, build_journey, home_features
from .services import (
    attendance_stats,
    build_semester_timeline,
    cancel_occurrence,
    cgpa_summary,
    get_holidays,
    holiday_for,
    restore_occurrence,
    sync_sessions,
)


# ------------------------------------------------------------------ helpers

def get_active_semester(user):
    """The user's active semester (falls back to the latest one)."""
    semesters = Semester.objects.filter(student=user)
    return (
        semesters.filter(is_active=True).first()
        or semesters.order_by("-start_date", "-created_at").first()
    )


def semester_view(view):
    """Login required, and the view receives the user's active semester.

    Every object is looked up through that semester, so users only ever
    reach their own data (anything else is a 404).
    """
    @login_required
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        semester = get_active_semester(request.user)
        if semester is None:
            messages.info(request, "Set up a semester first.")
            return redirect("academic:setup")
        return view(request, semester, *args, **kwargs)
    return wrapper


def save_form(request, form_class, semester, success_message, instance=None):
    """Handle a create/edit form. Returns (form, saved_object); the object is None
    on GET or when the form is invalid."""
    if request.method == "POST":
        form = form_class(request.POST, instance=instance, semester=semester)
        if form.is_valid():
            saved = form.save()
            messages.success(request, success_message)
            return form, saved
    else:
        form = form_class(instance=instance, semester=semester)
    return form, None


def flash_form_errors(request, form):
    for errors in form.errors.values():
        for error in errors:
            messages.error(request, error)


def redirect_back(request, default):
    """Go to the posted `next` URL if it is safe, otherwise to `default`."""
    target = request.POST.get("next", "")
    if target and url_has_allowed_host_and_scheme(
        target, allowed_hosts={request.get_host()}, require_https=request.is_secure()
    ):
        return redirect(target)
    return redirect(default)


def ensure_active_semester(user):
    if Semester.objects.filter(student=user, is_active=True).exists():
        return
    latest = Semester.objects.filter(student=user).order_by("-start_date", "-created_at").first()
    if latest:
        latest.is_active = True
        latest.save()


# ------------------------------------------------------------------- home
# Home helpers (unchanged logic from the original app)

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
    """Academic landing page. Works with or without a semester."""
    return render(request, "academic/home.html", {
        "semester": get_active_semester(request.user),
        "features": home_features(),
        "demo": DEMO_SEMESTER,
    })


@semester_view
def dashboard(request, semester):
    now = timezone.localtime()
    today = now.date()

    schedules = list(semester.class_schedules.select_related("course"))
    stats = build_stats(semester, today)
    holidays = get_holidays(semester)
    holiday = holiday_for(today, holidays)

    if holiday:
        todays_classes = []  # no classes on a holiday
    else:
        todays_classes = get_todays_classes(schedules, today, now.time(), stats)
        cancelled = set(
            ClassSession.objects.filter(semester=semester, date=today, is_cancelled=True)
            .values_list("weekly_class_id", flat=True)
        )
        todays_classes = [c for c in todays_classes if c.pk not in cancelled]
    status = get_current_status(stats, todays_classes)

    # Dashboard numbers
    sync_sessions(semester)  # keeps attendance up to date
    pending = semester.assignments.filter(is_completed=False)
    pending_list = list(pending.select_related("course"))  # soonest first (overdue first)
    deadlines = pending_list[:5]
    for assignment in deadlines:
        assignment.days_left = (assignment.due_date - today).days
    summary = cgpa_summary(request.user)
    history = history_summary(history_entries(SemesterGPA.objects.filter(student=request.user)))

    # CGPA shown: from the semester records when every record has credits,
    # otherwise from the course grades (the original calculation).
    if history["cgpa"] is not None:
        cgpa_value, cgpa_source = history["cgpa"], "semester records"
    else:
        cgpa_value, cgpa_source = summary["cgpa"], "course grades"

    context = {
        "semester": semester,
        "today": today,
        "holiday": holiday,
        "stats": stats,
        "status": status,
        "has_routine": bool(schedules),
        "todays_classes": todays_classes,
        "journey": build_journey(semester, today, stats, pending_list, holidays),
        "weekly_class_count": len(schedules),
        "course_count": semester.courses.count(),
        "pending_count": len(pending_list),
        "overdue_count": sum(1 for a in pending_list if a.due_date < today),
        "deadlines": deadlines,
        "attendance": attendance_stats(semester),
        "cgpa_value": cgpa_value,
        "cgpa_source": cgpa_source,
        "semester_gpa": next(
            (row["gpa"] for row in summary["semesters"] if row["semester"].pk == semester.pk),
            None,
        ),
    }
    return render(request, "academic/dashboard.html", context)


# --------------------------------------------------------------- semesters

@login_required
def semester_list(request):
    semesters = (
        Semester.objects.filter(student=request.user)
        .annotate(
            course_total=Count("courses", distinct=True),
            class_total=Count("class_schedules", distinct=True),
        )
        .order_by("-start_date")
    )
    return render(request, "academic/semester_list.html", {
        "semesters": semesters,
        "today": timezone.localdate(),
    })


@login_required
def semester_setup(request):
    if request.method == "POST":
        form = SemesterForm(request.POST, student=request.user)
        if form.is_valid():
            semester = form.save(commit=False)
            semester.student = request.user
            semester.is_active = True  # saving makes it the only active semester
            semester.save()
            messages.success(request, "Semester created. Next, add your courses.")
            return redirect("academic:course_list")
    else:
        form = SemesterForm(student=request.user)
    return render(request, "academic/semester_setup.html", {"semester_form": form})


@login_required
def semester_edit(request, pk):
    semester = get_object_or_404(Semester, pk=pk, student=request.user)
    if request.method == "POST":
        form = SemesterForm(request.POST, instance=semester, student=request.user)
        if form.is_valid():
            form.save()
            messages.success(request, "Semester updated.")
            return redirect("academic:semester_list")
    else:
        form = SemesterForm(instance=semester, student=request.user)
    return render(request, "academic/semester_setup.html", {
        "semester_form": form,
        "editing_semester": semester,
    })


@login_required
@require_POST
def semester_activate(request, pk):
    semester = get_object_or_404(Semester, pk=pk, student=request.user)
    semester.is_active = True
    semester.save()
    messages.success(request, f"{semester.name} is now your active semester.")
    return redirect("academic:semester_list")


@login_required
@require_POST
def semester_delete(request, pk):
    semester = get_object_or_404(Semester, pk=pk, student=request.user)
    name = semester.name
    semester.delete()  # removes its courses, routine, sessions, holidays and assignments
    ensure_active_semester(request.user)
    messages.success(request, f"{name} was deleted.")
    return redirect("academic:semester_list")


# ----------------------------------------------------------------- courses

@semester_view
def course_list(request, semester):
    form, saved = save_form(request, CourseForm, semester, "Course added.")
    if saved:
        return redirect("academic:course_list")

    courses = semester.courses.annotate(
        class_total=Count("weekly_classes", distinct=True),
        pending_total=Count(
            "assignments", filter=Q(assignments__is_completed=False), distinct=True
        ),
    )
    return render(request, "academic/course_list.html", {
        "semester": semester,
        "courses": courses,
        "total_credits": semester.courses.aggregate(total=Sum("credit"))["total"] or 0,
        "form": form,
    })



@semester_view
def course_edit(request, semester, pk):
    course = get_object_or_404(Course, pk=pk, semester=semester)
    form, saved = save_form(request, CourseForm, semester, "Course updated.", instance=course)
    if saved:
        return redirect("academic:course_list")
    return render(request, "academic/course_form.html", {
        "semester": semester,
        "course": course,
        "form": form,
    })


@semester_view
@require_POST
def course_delete(request, semester, pk):
    course = get_object_or_404(Course, pk=pk, semester=semester)
    try:
        course.delete()  # also removes its routine, assignments and grade
        messages.success(request, "Course deleted.")
    except RestrictedError:
        messages.error(request, "This course already has class history and cannot be deleted.")
    return redirect("academic:course_list")


# ----------------------------------------------------------------- routine

@semester_view
def routine_list(request, semester):
    form, saved = save_form(request, ClassScheduleForm, semester, "Class added to the routine.")
    if saved:
        return redirect("academic:routine_list")
    schedules = list(semester.class_schedules.select_related("course"))
    return render(request, "academic/routine_list.html", {
        "semester": semester,
        "routine_days": group_routine(schedules),
        "has_courses": semester.courses.exists(),
        "form": form,
    })


@semester_view
def routine_edit(request, semester, pk):
    schedule = get_object_or_404(ClassSchedule, pk=pk, semester=semester)
    form, saved = save_form(
        request, ClassScheduleForm, semester, "Class updated.", instance=schedule
    )
    if saved:
        return redirect("academic:routine_list")
    return render(request, "academic/routine_form.html", {
        "semester": semester,
        "schedule": schedule,
        "form": form,
    })


@semester_view
@require_POST
def routine_delete(request, semester, pk):
    schedule = get_object_or_404(ClassSchedule, pk=pk, semester=semester)
    schedule.delete()  # past sessions and attendance are kept as history
    messages.success(request, "Class removed from the routine.")
    return redirect("academic:routine_list")


@semester_view
@require_POST
def routine_cancel(request, semester, pk):
    """Cancel one dated occurrence (POST: date, reason). The routine is untouched."""
    schedule = get_object_or_404(ClassSchedule, pk=pk, semester=semester)
    form = CancelClassForm(request.POST, schedule=schedule)
    if form.is_valid():
        cancel_occurrence(schedule, form.cleaned_data["date"], form.cleaned_data["reason"])
        messages.success(request, "Class cancelled for that day.")
    else:
        flash_form_errors(request, form)
    return redirect_back(request, "academic:timeline")


@semester_view
@require_POST
def routine_restore(request, semester, pk):
    """Undo a cancellation (POST: date)."""
    schedule = get_object_or_404(ClassSchedule, pk=pk, semester=semester)
    form = CancelClassForm(request.POST, schedule=schedule)
    if form.is_valid():
        if restore_occurrence(schedule, form.cleaned_data["date"]):
            messages.success(request, "Class restored.")
        else:
            messages.info(request, "That class was not cancelled.")
    else:
        flash_form_errors(request, form)
    return redirect_back(request, "academic:timeline")


# ---------------------------------------------------------------- holidays

@semester_view
def holiday_list(request, semester):
    form, saved = save_form(request, HolidayForm, semester, "Holiday added.")
    if saved:
        return redirect("academic:holiday_list")
    return render(request, "academic/holiday_list.html", {
        "semester": semester,
        "holidays": semester.holidays.all(),
        "form": form,
    })


@semester_view
def holiday_edit(request, semester, pk):
    holiday = get_object_or_404(Holiday, pk=pk, semester=semester)
    form, saved = save_form(request, HolidayForm, semester, "Holiday updated.", instance=holiday)
    if saved:
        return redirect("academic:holiday_list")
    return render(request, "academic/holiday_form.html", {
        "semester": semester,
        "holiday": holiday,
        "form": form,
    })


@semester_view
@require_POST
def holiday_delete(request, semester, pk):
    holiday = get_object_or_404(Holiday, pk=pk, semester=semester)
    holiday.delete()
    messages.success(request, "Holiday deleted.")
    return redirect("academic:holiday_list")


# --------------------------------------------------------------- assignments

@semester_view
def assignment_list(request, semester):
    form, saved = save_form(request, AssignmentForm, semester, "Assignment added.")
    if saved:
        return redirect("academic:assignment_list")
    assignments = semester.assignments.select_related("course")
    return render(request, "academic/assignment_list.html", {
        "semester": semester,
        "today": timezone.localdate(),
        "assignments": assignments,
        "pending_count": assignments.filter(is_completed=False).count(),
        "has_courses": semester.courses.exists(),
        "form": form,
    })


@semester_view
def assignment_edit(request, semester, pk):
    assignment = get_object_or_404(Assignment, pk=pk, semester=semester)
    form, saved = save_form(
        request, AssignmentForm, semester, "Assignment updated.", instance=assignment
    )
    if saved:
        return redirect("academic:assignment_list")
    return render(request, "academic/assignment_form.html", {
        "semester": semester,
        "assignment": assignment,
        "form": form,
    })


@semester_view
@require_POST
def assignment_toggle(request, semester, pk):
    assignment = get_object_or_404(Assignment, pk=pk, semester=semester)
    assignment.is_completed = not assignment.is_completed
    assignment.save(update_fields=["is_completed"])
    return redirect_back(request, "academic:assignment_list")


@semester_view
@require_POST
def assignment_delete(request, semester, pk):
    assignment = get_object_or_404(Assignment, pk=pk, semester=semester)
    assignment.delete()
    messages.success(request, "Assignment deleted.")
    return redirect("academic:assignment_list")


# ----------------------------------------------------------------- timeline

@semester_view
def timeline(request, semester):
    sync_sessions(semester)
    today = timezone.localdate()
    return render(request, "academic/timeline.html", {
        "semester": semester,
        "today": today,
        "weeks": build_semester_timeline(semester, today),
    })


# --------------------------------------------------------------- attendance

@semester_view
def attendance_overview(request, semester):
    sync_sessions(semester)
    today = timezone.localdate()
    holidays = get_holidays(semester)

    sessions = semester.sessions.filter(date__lte=today).select_related("course", "attendance")
    course_id = request.GET.get("course", "")
    if course_id.isdigit():
        sessions = sessions.filter(course_id=int(course_id))
    sessions = [s for s in sessions.order_by("-date", "-start_time")
                if not holiday_for(s.date, holidays)]  # holidays are not counted

    return render(request, "academic/attendance.html", {
        "semester": semester,
        "sessions": sessions,
        "courses": semester.courses.all(),
        "stats": attendance_stats(semester),
        "status_choices": Attendance.Status.choices,
    })


@semester_view
@require_POST
def attendance_mark(request, semester, pk):
    """Change a class's attendance (POST: status, note). Defaults to Present."""
    session = get_object_or_404(ClassSession, pk=pk, semester=semester)
    if session.is_cancelled:
        messages.error(request, "This class was cancelled.")
    elif session.date > timezone.localdate():
        messages.error(request, "You can't mark attendance for a future class.")
    elif holiday_for(session.date, get_holidays(semester)):
        messages.error(request, "That day is a holiday.")
    else:
        attendance = getattr(session, "attendance", None) or Attendance(session=session)
        form = AttendanceForm(request.POST, instance=attendance)
        if form.is_valid():
            form.save()
            messages.success(request, "Attendance updated.")
        else:
            flash_form_errors(request, form)
    return redirect_back(request, "academic:attendance_overview")


# ------------------------------------------------------------------- grades

@login_required
def cgpa(request):
    """Semester-wise GPA history and analysis, plus the course grades of the active semester.

    The page works without a semester: the history is kept per student.
    """
    semester = get_active_semester(request.user)
    rows = []
    attendance_percentage = None
    if semester is not None:
        rows = [(course, getattr(course, "grade", None)) for course in semester.courses.select_related("grade")]
        attendance_percentage = attendance_stats(semester)["overall"]["percentage"]

    records = list(SemesterGPA.objects.filter(student=request.user))
    entries = history_entries(records)
    history = history_summary(entries)
    summary = cgpa_summary(request.user)
    return render(request, "academic/cgpa.html", {
        "semester": semester,
        "rows": rows,
        "summary": summary,
        "entries": entries,
        "history": history,
        "analysis": analyse(entries, history, rows, attendance_percentage),
        "distribution": grade_distribution(rows),
        "suggestions": suggestions(summary, entries),
        "next_term": next_term(records),
    })


@semester_view
def grade_edit(request, semester, pk):
    course = get_object_or_404(Course, pk=pk, semester=semester)
    grade = CourseGrade.objects.filter(course=course).first()
    if request.method == "POST":
        form = CourseGradeForm(request.POST, instance=grade, course=course)
        if form.is_valid():
            form.save()
            messages.success(request, "Grade saved.")
            return redirect("academic:cgpa")
    else:
        form = CourseGradeForm(instance=grade, course=course)
    return render(request, "academic/grade_form.html", {
        "semester": semester,
        "course": course,
        "form": form,
    })


@semester_view
@require_POST
def grade_delete(request, semester, pk):
    course = get_object_or_404(Course, pk=pk, semester=semester)
    CourseGrade.objects.filter(course=course).delete()
    messages.success(request, "Grade removed.")
    return redirect("academic:cgpa")


# --------------------------------------------------------- semester GPA records

def _gpa_form_page(request, form, record):
    return render(request, "academic/gpa_form.html", {
        "semester": get_active_semester(request.user),
        "form": form,
        "record": record,
    })


@login_required
def gpa_add(request):
    if request.method == "POST":
        form = SemesterGPAForm(request.POST, student=request.user)
        if form.is_valid():
            form.save()
            messages.success(request, "Semester GPA saved.")
            return redirect("academic:cgpa")
    else:
        records = SemesterGPA.objects.filter(student=request.user)
        form = SemesterGPAForm(student=request.user, initial={"term": next_term(records)})
    return _gpa_form_page(request, form, None)


@login_required
def gpa_edit(request, pk):
    record = get_object_or_404(SemesterGPA, pk=pk, student=request.user)
    if request.method == "POST":
        form = SemesterGPAForm(request.POST, instance=record, student=request.user)
        if form.is_valid():
            form.save()
            messages.success(request, "Semester GPA updated.")
            return redirect("academic:cgpa")
    else:
        form = SemesterGPAForm(instance=record, student=request.user)
    return _gpa_form_page(request, form, record)


@login_required
@require_POST
def gpa_delete(request, pk):
    record = get_object_or_404(SemesterGPA, pk=pk, student=request.user)
    record.delete()
    messages.success(request, "Semester GPA removed.")
    return redirect("academic:cgpa")
