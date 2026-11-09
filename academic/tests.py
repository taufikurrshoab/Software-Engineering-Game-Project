from datetime import date, datetime, time
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.conf import settings
from django.contrib.messages import get_messages
from django.shortcuts import resolve_url
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from . import insights, journey, services, views
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

User = get_user_model()
PASSWORD = "pw12345!"

# Views render these templates, which the frontend phase will create.
# The tests use stand-ins so the backend can be tested on its own.
TEMPLATE_NAMES = [
    "home", "semester_setup", "semester_list", "course_list", "course_form",
    "routine_list", "routine_form", "holiday_list", "holiday_form",
    "assignment_list", "assignment_form", "timeline", "attendance", "cgpa", "grade_form",
    "dashboard", "gpa_form", "feature_preview",
]
TEST_TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "OPTIONS": {
        "loaders": [(
            "django.template.loaders.locmem.Loader",
            {f"academic/{name}.html": "ok" for name in TEMPLATE_NAMES},
        )],
        "context_processors": [
            "django.template.context_processors.request",
            "django.contrib.auth.context_processors.auth",
            "django.contrib.messages.context_processors.messages",
        ],
    },
}]

START, END = date(2025, 9, 1), date(2025, 12, 31)  # 2025-09-01 is a Monday
NOW = timezone.make_aware(datetime(2025, 9, 24, 12, 0))  # a Wednesday, after class


def texts(response):
    return [str(m) for m in get_messages(response.wsgi_request)]


@override_settings(TEMPLATES=TEST_TEMPLATES)
class AcademicTestCase(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user("alice", password=PASSWORD)
        self.bob = User.objects.create_user("bob", password=PASSWORD)
        self.semester = Semester.objects.create(
            student=self.alice, name="Fall 2025", start_date=START, end_date=END,
        )
        self.course = Course.objects.create(
            semester=self.semester, name="Machine Learning", code="CS401",
            credit=Decimal("3.0"),
        )
        # Mondays 10:00-11:00
        self.schedule = ClassSchedule.objects.create(
            semester=self.semester, course=self.course, day_of_week=0,
            start_time=time(10, 0), end_time=time(11, 0), room="302",
        )
        self.client.login(username="alice", password=PASSWORD)

    def monday_session(self, day):
        return ClassSession.objects.get(weekly_class=self.schedule, date=day)


class AccessTests(AcademicTestCase):
    def test_visitors_get_a_read_only_preview_not_a_login_redirect(self):
        # (this used to assert 302: every feature page is now readable as a guest preview;
        #  GuestAccessTests below covers that a visitor still cannot change anything)
        self.client.logout()
        for name in ["semester_list", "course_list", "routine_list", "holiday_list",
                     "assignment_list", "timeline", "attendance_overview", "cgpa"]:
            response = self.client.get(reverse(f"academic:{name}"))
            self.assertEqual(response.status_code, 200, name)
            self.assertTemplateUsed(response, "academic/feature_preview.html")

    def test_user_without_semester_is_sent_to_setup(self):
        self.client.login(username="bob", password=PASSWORD)
        response = self.client.get(reverse("academic:course_list"))
        self.assertRedirects(response, reverse("academic:setup"), fetch_redirect_response=False)

    def test_other_users_data_is_not_reachable(self):
        Semester.objects.create(
            student=self.bob, name="Bob Sem", start_date=START, end_date=END,
        )
        holiday = Holiday.objects.create(
            semester=self.semester, title="Break",
            start_date=date(2025, 10, 1), end_date=date(2025, 10, 2),
        )
        assignment = Assignment.objects.create(
            semester=self.semester, course=self.course, title="HW",
            due_date=date(2025, 10, 10),
        )
        self.client.login(username="bob", password=PASSWORD)

        get_urls = [
            reverse("academic:course_edit", args=[self.course.pk]),
            reverse("academic:routine_edit", args=[self.schedule.pk]),
            reverse("academic:holiday_edit", args=[holiday.pk]),
            reverse("academic:assignment_edit", args=[assignment.pk]),
            reverse("academic:semester_edit", args=[self.semester.pk]),
            reverse("academic:grade_edit", args=[self.course.pk]),
        ]
        for url in get_urls:
            self.assertEqual(self.client.get(url).status_code, 404, url)

        post_urls = [
            reverse("academic:course_delete", args=[self.course.pk]),
            reverse("academic:routine_delete", args=[self.schedule.pk]),
            reverse("academic:routine_cancel", args=[self.schedule.pk]),
            reverse("academic:holiday_delete", args=[holiday.pk]),
            reverse("academic:assignment_toggle", args=[assignment.pk]),
            reverse("academic:assignment_delete", args=[assignment.pk]),
            reverse("academic:semester_activate", args=[self.semester.pk]),
            reverse("academic:semester_delete", args=[self.semester.pk]),
        ]
        for url in post_urls:
            self.assertEqual(self.client.post(url, {"date": "2025-09-15"}).status_code, 404, url)

        self.assertTrue(Course.objects.filter(pk=self.course.pk).exists())
        self.assertTrue(Semester.objects.filter(pk=self.semester.pk).exists())

    def test_post_only_views_reject_get(self):
        response = self.client.get(reverse("academic:course_delete", args=[self.course.pk]))
        self.assertEqual(response.status_code, 405)


class SemesterTests(AcademicTestCase):
    def post_semester(self, **overrides):
        data = {"name": "Spring 2026", "start_date": "2026-01-05", "end_date": "2026-05-30"}
        data.update(overrides)
        return self.client.post(reverse("academic:setup"), data)

    def test_setup_creates_and_activates_semester(self):
        response = self.post_semester()
        self.assertRedirects(response, reverse("academic:course_list"),
                             fetch_redirect_response=False)
        new = Semester.objects.get(student=self.alice, name="Spring 2026")
        self.assertTrue(new.is_active)
        self.assertEqual(Semester.objects.filter(student=self.alice, is_active=True).count(), 1)

    def test_end_date_must_be_after_start_date(self):
        response = self.post_semester(end_date="2026-01-05")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Semester.objects.filter(name="Spring 2026").exists())

    def test_duplicate_name_rejected(self):
        response = self.post_semester(name="fall 2025")
        self.assertEqual(response.status_code, 200)
        self.assertIn("name", response.context["semester_form"].errors)

    def test_dates_cannot_move_away_from_existing_holiday(self):
        Holiday.objects.create(semester=self.semester, title="Break",
                               start_date=date(2025, 9, 2), end_date=date(2025, 9, 3))
        response = self.client.post(
            reverse("academic:semester_edit", args=[self.semester.pk]),
            {"name": "Fall 2025", "start_date": "2025-10-01", "end_date": "2025-12-31"},
        )
        self.assertEqual(response.status_code, 200)
        self.semester.refresh_from_db()
        self.assertEqual(self.semester.start_date, START)

    def test_activate_switches_the_active_semester(self):
        other = Semester.objects.create(
            student=self.alice, name="Spring 2026",
            start_date=date(2026, 1, 5), end_date=date(2026, 5, 30),
        )
        self.assertFalse(other.is_active)
        self.client.post(reverse("academic:semester_activate", args=[other.pk]))
        other.refresh_from_db()
        self.semester.refresh_from_db()
        self.assertTrue(other.is_active)
        self.assertFalse(self.semester.is_active)

    def test_deleting_active_semester_activates_another(self):
        other = Semester.objects.create(
            student=self.alice, name="Spring 2026",
            start_date=date(2026, 1, 5), end_date=date(2026, 5, 30),
        )
        self.client.post(reverse("academic:semester_delete", args=[self.semester.pk]))
        other.refresh_from_db()
        self.assertTrue(other.is_active)
        self.assertFalse(Course.objects.filter(pk=self.course.pk).exists())


class CourseTests(AcademicTestCase):
    def post_course(self, **overrides):
        data = {"name": "Databases", "code": "CS402", "credit": "3.0",
                "teacher": "Dr. Rahman", "color": "#10B981"}
        data.update(overrides)
        return self.client.post(reverse("academic:course_list"), data)

    def test_create_course(self):
        response = self.post_course()
        self.assertRedirects(response, reverse("academic:course_list"),
                             fetch_redirect_response=False)
        self.assertTrue(Course.objects.filter(semester=self.semester, name="Databases").exists())

    def test_duplicate_name_and_code_rejected(self):
        self.assertEqual(self.post_course(name="machine learning").status_code, 200)
        self.assertEqual(self.post_course(code="cs401").status_code, 200)
        self.assertEqual(Course.objects.filter(semester=self.semester).count(), 1)

    def test_credit_must_be_positive_and_color_valid(self):
        self.assertEqual(self.post_course(credit="0").status_code, 200)
        self.assertEqual(self.post_course(color="blue").status_code, 200)
        self.assertEqual(Course.objects.filter(semester=self.semester).count(), 1)

    def test_same_name_allowed_in_another_semester(self):
        other = Semester.objects.create(
            student=self.alice, name="Spring 2026",
            start_date=date(2026, 1, 5), end_date=date(2026, 5, 30),
        )
        Course.objects.create(semester=other, name="Databases")
        self.assertEqual(self.post_course().status_code, 302)

    def test_edit_course(self):
        response = self.client.post(
            reverse("academic:course_edit", args=[self.course.pk]),
            {"name": "ML", "code": "CS401", "credit": "4.0", "teacher": "", "color": "#4F46E5"},
        )
        self.assertEqual(response.status_code, 302)
        self.course.refresh_from_db()
        self.assertEqual((self.course.name, self.course.credit), ("ML", Decimal("4.0")))

    def test_course_with_class_history_cannot_be_deleted(self):
        services.sync_sessions(self.semester, NOW)
        response = self.client.post(reverse("academic:course_delete", args=[self.course.pk]))
        self.assertEqual(response.status_code, 302)
        self.assertTrue(Course.objects.filter(pk=self.course.pk).exists())
        self.assertIn("cannot be deleted", texts(response)[0])

    def test_course_without_history_can_be_deleted(self):
        extra = Course.objects.create(semester=self.semester, name="Ethics")
        self.client.post(reverse("academic:course_delete", args=[extra.pk]))
        self.assertFalse(Course.objects.filter(pk=extra.pk).exists())


class RoutineTests(AcademicTestCase):
    def post_class(self, **overrides):
        data = {"course": self.course.pk, "day_of_week": 1,
                "start_time": "10:00", "end_time": "11:00", "room": "101"}
        data.update(overrides)
        return self.client.post(reverse("academic:routine_list"), data)

    def test_add_class_with_existing_course(self):
        response = self.post_class()
        self.assertRedirects(response, reverse("academic:routine_list"),
                             fetch_redirect_response=False)
        added = ClassSchedule.objects.get(semester=self.semester, day_of_week=1)
        self.assertEqual(added.course, self.course)
        self.assertEqual(added.course_name, "Machine Learning")

    def test_overlapping_class_rejected(self):
        response = self.post_class(day_of_week=0, start_time="10:30", end_time="11:30")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.context["form"].non_field_errors())
        self.assertEqual(ClassSchedule.objects.count(), 1)

    def test_back_to_back_classes_are_allowed(self):
        response = self.post_class(day_of_week=0, start_time="11:00", end_time="12:00")
        self.assertEqual(response.status_code, 302)

    def test_duplicate_class_rejected(self):
        response = self.post_class(day_of_week=0)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(ClassSchedule.objects.count(), 1)

    def test_end_before_start_rejected(self):
        response = self.post_class(start_time="12:00", end_time="11:00")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(ClassSchedule.objects.count(), 1)

    def test_course_from_another_semester_rejected(self):
        other = Semester.objects.create(
            student=self.alice, name="Spring 2026",
            start_date=date(2026, 1, 5), end_date=date(2026, 5, 30),
        )
        foreign = Course.objects.create(semester=other, name="Networks")
        response = self.post_class(course=foreign.pk)
        self.assertEqual(response.status_code, 200)
        self.assertIn("course", response.context["form"].errors)

    def test_class_cannot_overlap_itself_when_edited(self):
        response = self.client.post(
            reverse("academic:routine_edit", args=[self.schedule.pk]),
            {"course": self.course.pk, "day_of_week": 0,
             "start_time": "10:15", "end_time": "11:15", "room": "303"},
        )
        self.assertEqual(response.status_code, 302)
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.room, "303")


class SessionAndAttendanceTests(AcademicTestCase):
    def test_sessions_created_and_attendance_defaults_to_present(self):
        services.sync_sessions(self.semester, NOW)
        # Mondays: Sep 1, 8, 15, 22
        self.assertEqual(ClassSession.objects.count(), 4)
        statuses = set(Attendance.objects.values_list("status", flat=True))
        self.assertEqual(statuses, {"present"})
        self.assertEqual(Attendance.objects.count(), 4)

    def test_attendance_only_after_class_has_ended(self):
        during_class = timezone.make_aware(datetime(2025, 9, 22, 10, 30))
        services.sync_sessions(self.semester, during_class)
        self.assertEqual(ClassSession.objects.count(), 4)
        self.assertEqual(Attendance.objects.count(), 3)  # today's class is still running

    def test_sync_is_idempotent(self):
        services.sync_sessions(self.semester, NOW)
        services.sync_sessions(self.semester, NOW)
        self.assertEqual(ClassSession.objects.count(), 4)
        self.assertEqual(Attendance.objects.count(), 4)

    def test_no_sessions_during_holiday(self):
        Holiday.objects.create(semester=self.semester, title="Break",
                               start_date=date(2025, 9, 8), end_date=date(2025, 9, 9))
        services.sync_sessions(self.semester, NOW)
        dates = set(ClassSession.objects.values_list("date", flat=True))
        self.assertEqual(dates, {date(2025, 9, 1), date(2025, 9, 15), date(2025, 9, 22)})

    def test_holiday_added_later_is_excluded_from_stats(self):
        services.sync_sessions(self.semester, NOW)
        self.assertEqual(services.attendance_stats(self.semester)["overall"]["counted"], 4)
        Holiday.objects.create(semester=self.semester, title="Break",
                               start_date=date(2025, 9, 15), end_date=date(2025, 9, 16))
        self.assertEqual(services.attendance_stats(self.semester)["overall"]["counted"], 3)

    def test_mark_absent_and_it_is_not_overwritten(self):
        services.sync_sessions(self.semester, NOW)
        session = self.monday_session(date(2025, 9, 15))
        response = self.client.post(
            reverse("academic:attendance_mark", args=[session.pk]), {"status": "absent"},
        )
        self.assertRedirects(response, reverse("academic:attendance_overview"),
                             fetch_redirect_response=False)
        services.sync_sessions(self.semester, NOW)
        self.assertEqual(Attendance.objects.get(session=session).status, "absent")

        overall = services.attendance_stats(self.semester)["overall"]
        self.assertEqual((overall["present"], overall["absent"]), (3, 1))
        self.assertEqual(overall["percentage"], 75.0)

    def test_late_counts_as_attended_and_excused_is_not_counted(self):
        services.sync_sessions(self.semester, NOW)
        Attendance.objects.filter(session=self.monday_session(date(2025, 9, 8))).update(status="late")
        Attendance.objects.filter(session=self.monday_session(date(2025, 9, 1))).update(status="excused")
        overall = services.attendance_stats(self.semester)["overall"]
        self.assertEqual((overall["counted"], overall["attended"]), (3, 3))
        self.assertEqual(overall["percentage"], 100.0)

    def test_invalid_status_rejected(self):
        services.sync_sessions(self.semester, NOW)
        session = self.monday_session(date(2025, 9, 15))
        self.client.post(reverse("academic:attendance_mark", args=[session.pk]),
                         {"status": "sleeping"})
        self.assertEqual(Attendance.objects.get(session=session).status, "present")

    def test_cancel_one_class_keeps_the_routine(self):
        services.sync_sessions(self.semester, NOW)
        response = self.client.post(
            reverse("academic:routine_cancel", args=[self.schedule.pk]),
            {"date": "2025-09-15", "reason": "Teacher away"},
        )
        self.assertEqual(response.status_code, 302)
        session = self.monday_session(date(2025, 9, 15))
        self.assertTrue(session.is_cancelled)
        self.assertEqual(session.cancel_reason, "Teacher away")
        self.assertFalse(Attendance.objects.filter(session=session).exists())
        self.assertTrue(ClassSchedule.objects.filter(pk=self.schedule.pk).exists())
        # other weeks are unaffected, and a later sync does not undo the cancellation
        services.sync_sessions(self.semester, NOW)
        self.assertEqual(ClassSession.objects.filter(is_cancelled=True).count(), 1)
        self.assertEqual(services.attendance_stats(self.semester)["overall"]["counted"], 3)

    def test_cancel_future_class_and_restore(self):
        url_cancel = reverse("academic:routine_cancel", args=[self.schedule.pk])
        url_restore = reverse("academic:routine_restore", args=[self.schedule.pk])
        self.client.post(url_cancel, {"date": "2025-10-06"})
        self.assertTrue(self.monday_session(date(2025, 10, 6)).is_cancelled)
        self.client.post(url_restore, {"date": "2025-10-06"})
        self.assertFalse(self.monday_session(date(2025, 10, 6)).is_cancelled)

    def test_cancel_rejects_wrong_weekday_and_holiday(self):
        Holiday.objects.create(semester=self.semester, title="Break",
                               start_date=date(2025, 10, 6), end_date=date(2025, 10, 7))
        url = reverse("academic:routine_cancel", args=[self.schedule.pk])
        self.client.post(url, {"date": "2025-09-16"})  # a Tuesday
        self.client.post(url, {"date": "2025-10-06"})  # holiday
        self.client.post(url, {"date": "2026-02-02"})  # outside the semester
        self.assertEqual(ClassSession.objects.count(), 0)

    def test_cannot_mark_cancelled_class(self):
        session = services.cancel_occurrence(self.schedule, date(2025, 9, 15))
        self.client.post(reverse("academic:attendance_mark", args=[session.pk]),
                         {"status": "absent"})
        self.assertFalse(Attendance.objects.filter(session=session).exists())

    def test_deleting_routine_keeps_history(self):
        services.sync_sessions(self.semester, NOW)
        self.client.post(reverse("academic:routine_delete", args=[self.schedule.pk]))
        self.assertEqual(ClassSession.objects.count(), 4)
        self.assertEqual(Attendance.objects.count(), 4)

    def test_attendance_overview_excludes_holidays(self):
        Holiday.objects.create(semester=self.semester, title="Break",
                               start_date=date(2025, 9, 8), end_date=date(2025, 9, 9))
        response = self.client.get(reverse("academic:attendance_overview"))
        self.assertEqual(response.status_code, 200)
        expected = len(list(services.occurrences(self.schedule, START, END))) - 1
        self.assertEqual(len(response.context["sessions"]), expected)


class HolidayTests(AcademicTestCase):
    def post_holiday(self, **overrides):
        data = {"title": "Eid break", "start_date": "2025-10-10", "end_date": "2025-10-14"}
        data.update(overrides)
        return self.client.post(reverse("academic:holiday_list"), data)

    def test_date_range_holiday(self):
        self.assertEqual(self.post_holiday().status_code, 302)
        holiday = Holiday.objects.get()
        self.assertEqual((holiday.start_date, holiday.end_date),
                         (date(2025, 10, 10), date(2025, 10, 14)))

    def test_blank_end_date_means_single_day(self):
        self.post_holiday(end_date="")
        holiday = Holiday.objects.get()
        self.assertEqual(holiday.start_date, holiday.end_date)

    def test_invalid_holidays_rejected(self):
        self.assertEqual(self.post_holiday(end_date="2025-10-01").status_code, 200)  # reversed
        self.assertEqual(self.post_holiday(start_date="2025-08-01",
                                           end_date="2025-08-05").status_code, 200)  # outside
        self.assertEqual(Holiday.objects.count(), 0)

    def test_overlapping_holiday_rejected(self):
        self.post_holiday()
        response = self.post_holiday(title="Other", start_date="2025-10-12", end_date="2025-10-20")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Holiday.objects.count(), 1)


class AssignmentTests(AcademicTestCase):
    def post_assignment(self, **overrides):
        data = {"course": self.course.pk, "title": "Project 1",
                "description": "", "due_date": "2025-10-20"}
        data.update(overrides)
        return self.client.post(reverse("academic:assignment_list"), data)

    def test_create_assignment(self):
        self.assertEqual(self.post_assignment().status_code, 302)
        assignment = Assignment.objects.get()
        self.assertEqual((assignment.semester, assignment.is_completed), (self.semester, False))

    def test_due_date_must_be_inside_semester(self):
        self.assertEqual(self.post_assignment(due_date="2026-03-01").status_code, 200)
        self.assertEqual(Assignment.objects.count(), 0)

    def test_duplicate_rejected(self):
        self.post_assignment()
        self.assertEqual(self.post_assignment(title="project 1").status_code, 200)
        self.assertEqual(Assignment.objects.count(), 1)

    def test_course_must_belong_to_semester(self):
        other = Semester.objects.create(
            student=self.alice, name="Spring 2026",
            start_date=date(2026, 1, 5), end_date=date(2026, 5, 30),
        )
        foreign = Course.objects.create(semester=other, name="Networks")
        self.assertEqual(self.post_assignment(course=foreign.pk).status_code, 200)
        self.assertEqual(Assignment.objects.count(), 0)

    def test_toggle_completion(self):
        self.post_assignment()
        assignment = Assignment.objects.get()
        url = reverse("academic:assignment_toggle", args=[assignment.pk])
        self.client.post(url)
        assignment.refresh_from_db()
        self.assertTrue(assignment.is_completed)
        self.client.post(url)
        assignment.refresh_from_db()
        self.assertFalse(assignment.is_completed)

    def test_unsafe_next_url_is_ignored(self):
        self.post_assignment()
        assignment = Assignment.objects.get()
        response = self.client.post(
            reverse("academic:assignment_toggle", args=[assignment.pk]),
            {"next": "https://evil.example/"},
        )
        self.assertRedirects(response, reverse("academic:assignment_list"),
                             fetch_redirect_response=False)


class TimelineTests(AcademicTestCase):
    def test_timeline_shows_classes_cancellations_holidays_and_assignments(self):
        Holiday.objects.create(semester=self.semester, title="Break",
                               start_date=date(2025, 9, 8), end_date=date(2025, 9, 9))
        Assignment.objects.create(semester=self.semester, course=self.course,
                                  title="HW", due_date=date(2025, 9, 10))
        services.cancel_occurrence(self.schedule, date(2025, 9, 15), "Away")

        response = self.client.get(reverse("academic:timeline"))
        self.assertEqual(response.status_code, 200)
        weeks = response.context["weeks"]

        self.assertEqual(weeks[0]["start"], START)
        first_monday = weeks[0]["days"][0]
        self.assertEqual(len(first_monday["classes"]), 1)
        self.assertEqual(first_monday["classes"][0]["attendance_status"], "present")

        holiday_week = weeks[1]
        self.assertEqual(holiday_week["days"][0]["holiday"].title, "Break")
        self.assertEqual(holiday_week["days"][0]["classes"], [])
        self.assertEqual(len(holiday_week["days"][2]["assignments"]), 1)

        cancelled = weeks[2]["days"][0]["classes"][0]
        self.assertTrue(cancelled["is_cancelled"])
        self.assertEqual(cancelled["cancel_reason"], "Away")
        self.assertEqual(weeks[-1]["days"][-1]["date"], END)


class GradeTests(AcademicTestCase):
    def test_gpa_is_weighted_by_credit(self):
        small = Course.objects.create(semester=self.semester, name="Lab", credit=Decimal("1.0"))
        CourseGrade.objects.create(course=self.course, grade="A", grade_point=Decimal("4.00"))
        CourseGrade.objects.create(course=small, grade="C", grade_point=Decimal("2.00"))
        grades = CourseGrade.objects.select_related("course")
        gpa, credits = services.calculate_gpa(grades)
        self.assertEqual(gpa, Decimal("3.50"))  # (3*4 + 1*2) / 4
        self.assertEqual(credits, Decimal("4.0"))

    def test_gpa_without_grades(self):
        self.assertEqual(services.calculate_gpa([]), (None, Decimal("0")))

    def test_cgpa_across_semesters(self):
        small = Course.objects.create(semester=self.semester, name="Lab", credit=Decimal("1.0"))
        other = Semester.objects.create(
            student=self.alice, name="Spring 2026",
            start_date=date(2026, 1, 5), end_date=date(2026, 5, 30),
        )
        later = Course.objects.create(semester=other, name="Networks", credit=Decimal("3.0"))
        CourseGrade.objects.create(course=self.course, grade="A", grade_point=Decimal("4.00"))
        CourseGrade.objects.create(course=small, grade="C", grade_point=Decimal("2.00"))
        CourseGrade.objects.create(course=later, grade="B", grade_point=Decimal("3.00"))

        summary = services.cgpa_summary(self.alice)
        self.assertEqual(len(summary["semesters"]), 2)
        self.assertEqual(summary["cgpa"], Decimal("3.29"))  # 23 / 7
        self.assertEqual(summary["credits"], Decimal("7.0"))
        # another student's grades never count
        self.assertIsNone(services.cgpa_summary(self.bob)["cgpa"])

    def test_save_update_and_remove_grade(self):
        url = reverse("academic:grade_edit", args=[self.course.pk])
        response = self.client.post(url, {"grade": "A", "grade_point": "4.00"})
        self.assertRedirects(response, reverse("academic:cgpa"), fetch_redirect_response=False)
        self.client.post(url, {"grade": "A-", "grade_point": "3.70"})
        grade = CourseGrade.objects.get(course=self.course)  # still one row
        self.assertEqual((grade.grade, grade.grade_point), ("A-", Decimal("3.70")))

        page = self.client.get(reverse("academic:cgpa"))
        self.assertEqual(page.context["summary"]["cgpa"], Decimal("3.70"))

        self.client.post(reverse("academic:grade_delete", args=[self.course.pk]))
        self.assertFalse(CourseGrade.objects.exists())

    def test_grade_point_out_of_range_rejected(self):
        url = reverse("academic:grade_edit", args=[self.course.pk])
        response = self.client.post(url, {"grade": "A+", "grade_point": "5.00"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(CourseGrade.objects.exists())


# ------------------------------------------------------- home and dashboard

class HomeAndDashboardTests(AcademicTestCase):
    def test_home_and_dashboard_are_open_to_visitors(self):
        # (this used to assert 302; visitors now see the home page and a labelled demo dashboard)
        self.client.logout()
        home = self.client.get(reverse("academic:home"))
        dashboard = self.client.get(reverse("academic:dashboard"))
        self.assertEqual((home.status_code, dashboard.status_code), (200, 200))
        self.assertTrue(home.context["is_guest"])
        self.assertIsNone(home.context["semester"])
        self.assertTrue(dashboard.context["is_demo"])

    def test_home_works_without_a_semester(self):
        self.client.login(username="bob", password=PASSWORD)
        response = self.client.get(reverse("academic:home"))
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.context["semester"])
        self.assertEqual(len(response.context["features"]), 9)
        self.assertEqual(response.context["demo"]["cgpa"], "3.75")

    def test_home_and_dashboard_are_separate_pages(self):
        self.assertNotEqual(reverse("academic:home"), reverse("academic:dashboard"))
        home = self.client.get(reverse("academic:home"))
        dashboard = self.client.get(reverse("academic:dashboard"))
        self.assertEqual(home.status_code, 200)
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(home.context["semester"], self.semester)
        self.assertNotIn("journey", home.context)
        self.assertIn("journey", dashboard.context)

    def test_dashboard_needs_a_semester(self):
        self.client.login(username="bob", password=PASSWORD)
        response = self.client.get(reverse("academic:dashboard"))
        self.assertRedirects(response, reverse("academic:setup"), fetch_redirect_response=False)

    def test_dashboard_journey_comes_from_real_data(self):
        Assignment.objects.create(
            semester=self.semester, course=self.course, title="HW", due_date=date(2025, 10, 10),
        )
        response = self.client.get(reverse("academic:dashboard"))
        events = response.context["journey"]["events"]
        kinds = [event["kind"] for event in events]
        for kind in ("start", "half", "end", "assignment"):
            self.assertIn(kind, kinds)
        self.assertEqual(response.context["pending_count"], 1)

    def test_dashboard_cgpa_prefers_complete_semester_records(self):
        CourseGrade.objects.create(course=self.course, grade="B", grade_point=Decimal("3.00"))
        response = self.client.get(reverse("academic:dashboard"))
        self.assertEqual(response.context["cgpa_value"], Decimal("3.00"))
        self.assertEqual(response.context["cgpa_source"], "course grades")

        SemesterGPA.objects.create(student=self.alice, name="Old", term=1, gpa=Decimal("4.00"), credits=Decimal("10"))
        response = self.client.get(reverse("academic:dashboard"))
        self.assertEqual(response.context["cgpa_value"], Decimal("4.00"))
        self.assertEqual(response.context["cgpa_source"], "semester records")


class JourneyTests(AcademicTestCase):
    def build(self, today, pending=(), holidays=()):
        stats = views.build_stats(self.semester, today)
        return journey.build_journey(self.semester, today, stats, list(pending), list(holidays)), stats

    def test_milestones_use_the_semester_dates(self):
        result, _stats = self.build(date(2025, 10, 20))
        by_kind = {event["kind"]: event for event in result["events"]}
        self.assertEqual(by_kind["start"]["date"], START)
        self.assertEqual(by_kind["end"]["date"], END)
        self.assertEqual(by_kind["half"]["date"], START + (END - START) // 2)
        self.assertEqual(by_kind["start"]["state"], "past")
        self.assertEqual(by_kind["end"]["state"], "upcoming")

    def test_week_counts_follow_today(self):
        result, stats = self.build(date(2025, 10, 20))
        self.assertEqual(result["weeks_done"], stats["current_week"] - 1)
        self.assertEqual(result["weeks_left"], stats["total_weeks"] - stats["current_week"])
        self.assertIn(f"Week {stats['current_week']}", result["now_label"])

    def test_deadline_branch_has_title_course_and_remaining_time(self):
        assignment = Assignment.objects.create(
            semester=self.semester, course=self.course, title="Report", due_date=date(2025, 10, 22),
        )
        result, _stats = self.build(date(2025, 10, 20), pending=[assignment])
        event = next(e for e in result["events"] if e["kind"] == "assignment")
        self.assertEqual(event["title"], "Report")
        self.assertEqual(event["course"], "Machine Learning")
        self.assertEqual(event["relative"], "Due in 2 days")
        self.assertEqual(event["anchor"], f"#assignment-{assignment.pk}")
        self.assertTrue(result["has_deadlines"])

    def test_no_pending_assignments_gives_an_empty_branch(self):
        result, _stats = self.build(date(2025, 10, 20))
        ghosts = [e for e in result["events"] if e["kind"] == "empty"]
        self.assertEqual(len(ghosts), 1)
        self.assertFalse(result["has_deadlines"])

    def test_overdue_assignment_is_flagged_and_sorted_first(self):
        old = Assignment.objects.create(semester=self.semester, course=self.course, title="Old", due_date=date(2025, 10, 1))
        new = Assignment.objects.create(semester=self.semester, course=self.course, title="New", due_date=date(2025, 10, 25))
        result, _stats = self.build(date(2025, 10, 20), pending=[old, new])
        deadlines = [e for e in result["events"] if e["kind"] == "assignment"]
        self.assertEqual([e["title"] for e in deadlines], ["Old", "New"])
        self.assertEqual(deadlines[0]["state"], "overdue")
        self.assertTrue(deadlines[0]["relative"].startswith("Overdue by"))

    def test_only_current_and_upcoming_holidays_are_shown(self):
        past = Holiday.objects.create(semester=self.semester, title="Past", start_date=date(2025, 9, 10), end_date=date(2025, 9, 11))
        soon = Holiday.objects.create(semester=self.semester, title="Soon", start_date=date(2025, 11, 1), end_date=date(2025, 11, 3))
        result, _stats = self.build(date(2025, 10, 20), holidays=[past, soon])
        titles = [e["title"] for e in result["events"] if e["kind"] == "holiday"]
        self.assertEqual(titles, ["Soon"])

    def test_events_are_ordered_and_today_sits_on_the_line(self):
        result, _stats = self.build(date(2025, 10, 20))
        dates = [e["sort_date"] for e in result["events"]]
        self.assertEqual(dates, sorted(dates))
        self.assertTrue(0 < result["now"] < 100)
        self.assertEqual([e["side"] for e in result["events"][:3]], ["up", "down", "up"])

    def test_before_start_and_after_end(self):
        before, _s = self.build(date(2025, 8, 15))
        self.assertEqual(before["weeks_done"], 0)
        after, _s = self.build(date(2026, 2, 1))
        self.assertEqual(after["weeks_left"], 0)
        self.assertEqual(after["now"], 100.0)
        self.assertEqual(after["now_label"], "Semester complete")

    def test_home_branches_are_complete(self):
        features = journey.home_features()
        self.assertEqual(len(features), 9)
        for feature in features:
            self.assertTrue(feature["path"].startswith("M"))
            self.assertTrue(feature["title"] and feature["text"])


# --------------------------------------------------- semester GPA records

class SemesterGPATests(AcademicTestCase):
    def payload(self, **overrides):
        data = {"name": "1st Year 1st Semester", "term": 1, "gpa": "3.45", "credits": "15"}
        data.update(overrides)
        return data

    def add(self, **overrides):
        return self.client.post(reverse("academic:gpa_add"), self.payload(**overrides))

    def test_login_required(self):
        self.client.logout()
        self.assertEqual(self.client.get(reverse("academic:gpa_add")).status_code, 302)

    def test_add_a_semester_gpa(self):
        response = self.add()
        self.assertRedirects(response, reverse("academic:cgpa"), fetch_redirect_response=False)
        record = SemesterGPA.objects.get()
        self.assertEqual((record.student, record.term, record.gpa), (self.alice, 1, Decimal("3.45")))
        self.assertEqual(record.credits, Decimal("15.0"))
        self.assertEqual(texts(response), ["Semester GPA saved."])

    def test_credits_are_optional(self):
        self.add(credits="")
        self.assertIsNone(SemesterGPA.objects.get().credits)

    def test_gpa_must_be_between_zero_and_four(self):
        for bad in ("4.5", "-0.1"):
            response = self.add(gpa=bad)
            self.assertEqual(response.status_code, 200)
            self.assertIn("gpa", response.context["form"].errors)
        self.assertFalse(SemesterGPA.objects.exists())

    def test_credits_must_be_positive(self):
        response = self.add(credits="0")
        self.assertEqual(response.status_code, 200)
        self.assertIn("credits", response.context["form"].errors)

    def test_duplicate_name_or_number_is_rejected(self):
        self.add()
        self.assertIn("name", self.add(term=2).context["form"].errors)
        self.assertIn("term", self.add(name="Another one").context["form"].errors)
        self.assertEqual(SemesterGPA.objects.count(), 1)

    def test_the_add_form_suggests_the_next_number(self):
        self.add()
        response = self.client.get(reverse("academic:gpa_add"))
        self.assertEqual(response.context["form"].initial["term"], 2)

    def test_edit(self):
        self.add()
        record = SemesterGPA.objects.get()
        url = reverse("academic:gpa_edit", args=[record.pk])
        self.assertEqual(self.client.get(url).status_code, 200)
        response = self.client.post(url, self.payload(gpa="3.80"))
        self.assertRedirects(response, reverse("academic:cgpa"), fetch_redirect_response=False)
        record.refresh_from_db()
        self.assertEqual(record.gpa, Decimal("3.80"))

    def test_editing_keeps_its_own_name_and_number(self):
        self.add()
        record = SemesterGPA.objects.get()
        response = self.client.post(reverse("academic:gpa_edit", args=[record.pk]), self.payload())
        self.assertEqual(response.status_code, 302)

    def test_delete(self):
        self.add()
        record = SemesterGPA.objects.get()
        url = reverse("academic:gpa_delete", args=[record.pk])
        self.assertEqual(self.client.get(url).status_code, 405)
        self.assertEqual(self.client.post(url).status_code, 302)
        self.assertFalse(SemesterGPA.objects.exists())

    def test_other_users_records_are_not_reachable(self):
        record = SemesterGPA.objects.create(student=self.bob, name="Bob", term=1, gpa=Decimal("3.0"))
        for url in (reverse("academic:gpa_edit", args=[record.pk]),):
            self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.post(reverse("academic:gpa_delete", args=[record.pk])).status_code, 404)
        self.assertTrue(SemesterGPA.objects.filter(pk=record.pk).exists())
        self.assertEqual(self.client.get(reverse("academic:cgpa")).context["entries"], [])


class CGPAPageTests(AcademicTestCase):
    def record(self, term, gpa, credits=None, user=None):
        return SemesterGPA.objects.create(
            student=user or self.alice, name=f"Sem {term}", term=term,
            gpa=Decimal(gpa), credits=None if credits is None else Decimal(credits),
        )

    def test_cgpa_is_credit_weighted_when_every_record_has_credits(self):
        self.record(1, "3.00", "10")
        self.record(2, "4.00", "30")
        history = self.client.get(reverse("academic:cgpa")).context["history"]
        self.assertEqual(history["cgpa"], Decimal("3.75"))
        self.assertEqual(history["average"], Decimal("3.50"))

    def test_cgpa_is_not_guessed_when_credits_are_missing(self):
        self.record(1, "3.00", "10")
        self.record(2, "4.00")
        history = self.client.get(reverse("academic:cgpa")).context["history"]
        self.assertIsNone(history["cgpa"])
        self.assertEqual(history["missing_credits"], 1)
        self.assertEqual(history["average"], Decimal("3.50"))

    def test_entries_are_ordered_with_changes(self):
        self.record(2, "3.60")
        self.record(1, "3.45")
        entries = self.client.get(reverse("academic:cgpa")).context["entries"]
        self.assertEqual([e["term"] for e in entries], [1, 2])
        self.assertEqual(entries[1]["delta"], Decimal("0.15"))
        self.assertEqual(entries[1]["direction"], "up")

    def test_analysis_waits_for_enough_records(self):
        self.record(1, "3.00")
        analysis = self.client.get(reverse("academic:cgpa")).context["analysis"]
        self.assertIsNone(analysis["trend"])
        self.assertFalse(analysis["enough"])
        self.assertEqual(analysis["observations"], [])

    def test_page_works_without_a_semester(self):
        self.record(1, "3.20", user=self.bob)
        self.client.login(username="bob", password=PASSWORD)
        response = self.client.get(reverse("academic:cgpa"))
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.context["semester"])
        self.assertEqual(response.context["rows"], [])
        self.assertEqual(len(response.context["entries"]), 1)

    def test_course_grades_are_untouched_by_semester_records(self):
        CourseGrade.objects.create(course=self.course, grade="A-", grade_point=Decimal("3.50"))
        before = services.cgpa_summary(self.alice)
        self.record(1, "2.00", "10")
        after = services.cgpa_summary(self.alice)
        self.assertEqual(before["cgpa"], Decimal("3.50"))
        self.assertEqual(after["cgpa"], before["cgpa"])
        response = self.client.get(reverse("academic:cgpa"))
        self.assertEqual(response.context["summary"]["cgpa"], Decimal("3.50"))
        self.assertEqual(response.context["rows"][0][1].grade, "A-")

    def test_unrecorded_semesters_with_grades_are_suggested_once(self):
        CourseGrade.objects.create(course=self.course, grade="A", grade_point=Decimal("4.00"))
        suggestions = self.client.get(reverse("academic:cgpa")).context["suggestions"]
        self.assertEqual([s["name"] for s in suggestions], ["Fall 2025"])
        self.assertEqual(suggestions[0]["gpa"], Decimal("4.00"))
        SemesterGPA.objects.create(student=self.alice, name="fall 2025", term=1, gpa=Decimal("4.00"))
        self.assertEqual(self.client.get(reverse("academic:cgpa")).context["suggestions"], [])


class InsightRuleTests(SimpleTestCase):
    """The advice rules, on plain records (no database)."""

    @staticmethod
    def records(gpas, credits=None):
        from types import SimpleNamespace
        return [
            SimpleNamespace(
                name=f"Sem {i + 1}", term=i + 1, gpa=Decimal(str(g)),
                credits=None if credits is None else Decimal(str(credits[i])),
            )
            for i, g in enumerate(gpas)
        ]

    def run_rules(self, gpas, credits=None, rows=(), attendance=None):
        entries = insights.history_entries(self.records(gpas, credits))
        summary = insights.history_summary(entries)
        return summary, insights.analyse(entries, summary, rows, attendance)

    def test_improving_over_several_semesters(self):
        summary, analysis = self.run_rules([3.45, 3.60, 3.72, 3.55, 3.80, 3.85])
        self.assertEqual(analysis["trend"], "improving")
        self.assertEqual(summary["average"], Decimal("3.66"))
        self.assertEqual(summary["best"]["name"], "Sem 6")

    def test_consecutive_improvement_advice(self):
        _summary, analysis = self.run_rules([3.0, 3.2, 3.4, 3.6])
        texts_ = [a["text"] for a in analysis["advice"]]
        self.assertTrue(any("improved for 3 consecutive semesters" in t for t in texts_))

    def test_declining(self):
        _summary, analysis = self.run_rules([3.9, 3.7, 3.5, 3.2])
        self.assertEqual(analysis["trend"], "declining")
        self.assertTrue(any("declined for 3 consecutive semesters" in o["text"] for o in analysis["observations"]))
        self.assertTrue(any("declining" in a["text"] for a in analysis["advice"]))

    def test_stable_and_consistent(self):
        _summary, analysis = self.run_rules([3.50, 3.52, 3.49, 3.51])
        self.assertEqual(analysis["trend"], "stable")
        self.assertTrue(any("consistent" in o["text"] for o in analysis["observations"]))

    def test_not_enough_records_gives_no_trend(self):
        for gpas in ([], [3.2], [3.2, 3.4]):
            _summary, analysis = self.run_rules(gpas)
            self.assertIsNone(analysis["trend"])
        _summary, analysis = self.run_rules([3.2, 3.4])
        self.assertIn("not entered enough", analysis["advice"][0]["text"])

    def test_credit_weighted_cgpa_needs_every_credit(self):
        summary, _analysis = self.run_rules([3.0, 4.0], credits=[10, 30])
        self.assertEqual(summary["cgpa"], Decimal("3.75"))
        summary, _analysis = self.run_rules([3.0, 4.0])
        self.assertIsNone(summary["cgpa"])

    def test_course_and_attendance_advice_use_real_values(self):
        from types import SimpleNamespace as NS
        rows = [
            (NS(name="Math", credit=Decimal("3.0")), NS(grade="C", grade_point=Decimal("2.0"))),
            (NS(name="Art", credit=Decimal("1.5")), NS(grade="A", grade_point=Decimal("4.0"))),
            (NS(name="Unfinished", credit=Decimal("3.0")), None),
        ]
        _summary, analysis = self.run_rules([3.0, 3.2, 3.4], [15, 15, 15], rows, attendance=62.5)
        texts_ = [a["text"] for a in analysis["advice"]]
        self.assertTrue(any("lowest grade this semester is C in Math (3 credits)" in t for t in texts_))
        self.assertTrue(any("62.5%" in t for t in texts_))

    def test_grade_distribution_groups_letters(self):
        from types import SimpleNamespace as NS
        rows = [
            (NS(), NS(grade="a", grade_point=Decimal("4.0"))),
            (NS(), NS(grade="A", grade_point=Decimal("4.0"))),
            (NS(), NS(grade="B", grade_point=Decimal("3.0"))),
            (NS(), None),
        ]
        distribution = insights.grade_distribution(rows)
        self.assertEqual([(d["grade"], d["count"]) for d in distribution], [("A", 2), ("B", 1)])
        self.assertEqual(distribution[0]["fill"], 100)


# ------------------------------------------------------------ guest access

def row_counts():
    return {model.__name__: model.objects.count() for model in (
        Semester, Course, ClassSchedule, ClassSession, Attendance, Holiday, Assignment, CourseGrade, SemesterGPA)}


class GuestAccessTests(AcademicTestCase):
    """A visitor can READ every Academic page, and can never change anything."""

    PAGES = ["semester_list", "setup", "course_list", "routine_list", "holiday_list",
             "assignment_list", "timeline", "attendance_overview", "cgpa"]

    def setUp(self):
        super().setUp()
        self.client.logout()

    def test_every_feature_page_opens_without_logging_in(self):
        for name in self.PAGES:
            response = self.client.get(reverse(f"academic:{name}"))
            self.assertEqual(response.status_code, 200, name)
            self.assertTemplateUsed(response, "academic/feature_preview.html")
            self.assertTrue(response.context["is_guest"], name)
            self.assertEqual(len(response.context["points"]), 3, name)

    def test_the_preview_sends_you_back_to_the_same_page_after_signing_in(self):
        url = reverse("academic:course_list")
        login_url = self.client.get(url).context["login_url"]
        self.assertTrue(login_url.startswith(resolve_url(settings.LOGIN_URL)))
        self.assertIn("next=" + url, login_url)

    def test_a_visitor_cannot_create_anything(self):
        before = row_counts()
        posts = {
            "setup": {"name": "Hack", "start_date": "2025-09-01", "end_date": "2025-12-31"},
            "course_list": {"name": "Hack", "code": "H1", "credit": "3"},
            "routine_list": {"course": self.course.pk, "day_of_week": 1, "start_time": "09:00", "end_time": "10:00"},
            "holiday_list": {"title": "Hack", "start_date": "2025-10-01", "end_date": "2025-10-02"},
            "assignment_list": {"course": self.course.pk, "title": "Hack", "due_date": "2025-10-10"},
            "cgpa": {"name": "Hack", "term": 1, "gpa": "4.0", "credits": "10"},
            "semester_list": {"name": "Hack"},
        }
        for name, data in posts.items():
            response = self.client.post(reverse(f"academic:{name}"), data)
            self.assertEqual(response.status_code, 302, name)
            self.assertTrue(response["Location"].startswith(resolve_url(settings.LOGIN_URL)), name)
        self.assertEqual(row_counts(), before)

    def test_other_http_methods_are_refused_too(self):
        before = row_counts()
        url = reverse("academic:course_list")
        for method in (self.client.put, self.client.patch, self.client.delete):
            self.assertEqual(method(url).status_code, 302)
        self.assertEqual(row_counts(), before)

    def test_edit_delete_and_toggle_routes_still_need_login(self):
        before = row_counts()
        assignment = Assignment.objects.create(
            semester=self.semester, course=self.course, title="HW", due_date=date(2025, 10, 10))
        before = row_counts()
        routes = [
            reverse("academic:course_edit", args=[self.course.pk]),
            reverse("academic:course_delete", args=[self.course.pk]),
            reverse("academic:routine_edit", args=[self.schedule.pk]),
            reverse("academic:routine_cancel", args=[self.schedule.pk]),
            reverse("academic:assignment_edit", args=[assignment.pk]),
            reverse("academic:assignment_toggle", args=[assignment.pk]),
            reverse("academic:assignment_delete", args=[assignment.pk]),
            reverse("academic:semester_edit", args=[self.semester.pk]),
            reverse("academic:semester_delete", args=[self.semester.pk]),
            reverse("academic:semester_activate", args=[self.semester.pk]),
            reverse("academic:attendance_mark", args=[1]),
            reverse("academic:grade_edit", args=[self.course.pk]),
            reverse("academic:gpa_add"),
        ]
        for url in routes:
            self.assertEqual(self.client.get(url).status_code, 302, url)
            self.assertEqual(self.client.post(url, {"date": "2025-09-15"}).status_code, 302, url)
        self.assertEqual(row_counts(), before)
        assignment.refresh_from_db()
        self.assertFalse(assignment.is_completed)

    def test_visiting_as_a_guest_writes_nothing(self):
        before = row_counts()
        for name in self.PAGES + ["home", "dashboard"]:
            self.client.get(reverse(f"academic:{name}"))
        self.assertEqual(row_counts(), before)


class GuestDemoDataTests(AcademicTestCase):
    """Demo data is built in memory, is labelled, and never mixes with real records."""

    def setUp(self):
        super().setUp()
        Course.objects.create(semester=self.semester, name="Private Quantum Course", code="PQ1", credit=Decimal("3.0"))
        Assignment.objects.create(semester=self.semester, course=self.course, title="Private HW secret",
                                  due_date=date(2025, 10, 10))
        Holiday.objects.create(semester=self.semester, title="Private holiday",
                               start_date=date(2025, 10, 1), end_date=date(2025, 10, 2))
        SemesterGPA.objects.create(student=self.alice, name="Private GPA", term=1, gpa=Decimal("3.99"), credits=Decimal("12"))

    def test_the_guest_dashboard_is_labelled_and_in_memory(self):
        self.client.logout()
        before = row_counts()
        response = self.client.get(reverse("academic:dashboard"))
        context = response.context
        self.assertTrue(context["is_demo"])
        self.assertTrue(context["is_guest"])
        self.assertNotIsInstance(context["semester"], Semester)
        self.assertEqual(context["stats"]["current_week"], 12)
        self.assertEqual(context["course_count"], 5)
        self.assertEqual(len(context["snake"]["nodes"]), len(context["journey"]["events"]))
        self.assertEqual(row_counts(), before)

    def test_no_real_record_ever_appears_in_guest_pages(self):
        self.client.logout()
        for name in ["home", "dashboard", "course_list", "assignment_list", "holiday_list", "cgpa", "timeline"]:
            response = self.client.get(reverse(f"academic:{name}"))
            shown = repr(response.context.flatten() if hasattr(response.context, "flatten") else response.context)
            for secret in ("Private Quantum Course", "Private HW secret", "Private holiday", "Private GPA", "alice"):
                self.assertNotIn(secret, shown, f"{secret} leaked into {name}")

    def test_a_signed_in_user_never_gets_the_demo(self):
        response = self.client.get(reverse("academic:dashboard"))
        self.assertFalse(response.context["is_demo"])
        self.assertEqual(response.context["semester"], self.semester)
        self.assertEqual(response.context["course_count"], 2)
        for name in ["course_list", "assignment_list", "cgpa"]:
            self.assertTemplateNotUsed(self.client.get(reverse(f"academic:{name}")), "academic/feature_preview.html")


class DashboardSnakeTests(AcademicTestCase):
    """The dashboard timeline is built from the signed-in user's own data, and every node goes somewhere real."""

    def test_nodes_come_from_the_users_own_semester_only(self):
        Assignment.objects.create(semester=self.semester, course=self.course, title="Alice only",
                                  due_date=date(2025, 10, 10))
        bob_semester = Semester.objects.create(student=self.bob, name="Bob Sem", start_date=START, end_date=END)
        bob_course = Course.objects.create(semester=bob_semester, name="Bob Course", code="B1", credit=Decimal("3.0"))
        Assignment.objects.create(semester=bob_semester, course=bob_course, title="Bob only", due_date=date(2025, 10, 11))

        alice_titles = [n["title"] for n in self.client.get(reverse("academic:dashboard")).context["snake"]["nodes"]]
        self.assertIn("Alice only", alice_titles)
        self.assertNotIn("Bob only", alice_titles)

        self.client.login(username="bob", password=PASSWORD)
        bob_titles = [n["title"] for n in self.client.get(reverse("academic:dashboard")).context["snake"]["nodes"]]
        self.assertIn("Bob only", bob_titles)
        self.assertNotIn("Alice only", bob_titles)

    def test_every_node_reverses_to_a_real_url(self):
        assignment = Assignment.objects.create(semester=self.semester, course=self.course, title="HW",
                                               due_date=date(2025, 10, 10))
        holiday = Holiday.objects.create(semester=self.semester, title="Break",
                                         start_date=date(2025, 10, 20), end_date=date(2025, 10, 21))
        # pin "now" to the suite's usual date: a holiday only appears on the journey while it is still ahead
        with mock.patch("django.utils.timezone.localtime", return_value=NOW):
            nodes = self.client.get(reverse("academic:dashboard")).context["snake"]["nodes"]
        by_kind = {n["kind"]: n for n in nodes}
        for node in nodes:
            self.assertTrue(reverse(node["url_name"]))
            self.assertTrue(node["anchor"] == "" or node["anchor"].startswith("#"))
        self.assertEqual(by_kind["assignment"]["anchor"], f"#assignment-{assignment.pk}")
        self.assertEqual(by_kind["holiday"]["anchor"], f"#holiday-{holiday.pk}")
        self.assertEqual(by_kind["assignment"]["url_name"], "academic:assignment_list")
        self.assertEqual(by_kind["holiday"]["url_name"], "academic:holiday_list")

    def test_the_today_marker_matches_the_journey(self):
        context = self.client.get(reverse("academic:dashboard")).context
        self.assertAlmostEqual(float(context["snake"]["now"]["at_w"]), context["journey"]["now"] / 100, places=4)

    def test_home_timeline_has_one_clickable_node_per_feature(self):
        snake = self.client.get(reverse("academic:home")).context["snake"]
        self.assertEqual(len(snake["nodes"]), 9)
        for node in snake["nodes"]:
            self.assertTrue(reverse(node["url_name"]))


# ------------------------------------------------- the real templates render

BASE_STUB = "{% block title %}{% endblock %}{% block extra_css %}{% endblock %}{% block content %}{% endblock %}{% block extra_js %}{% endblock %}"
REAL_TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "OPTIONS": {
        "loaders": [
            ("django.template.loaders.locmem.Loader", {"base.html": BASE_STUB}),   # the site's own layout is not needed here
            "django.template.loaders.app_directories.Loader",                       # the REAL Academic templates
        ],
        "context_processors": [
            "django.template.context_processors.request",
            "django.contrib.auth.context_processors.auth",
            "django.contrib.messages.context_processors.messages",
        ],
    },
}]


@override_settings(TEMPLATES=REAL_TEMPLATES)
class RealTemplateTests(TestCase):
    """Renders the actual home, dashboard and preview templates (with a stand-in for the site layout)."""

    def setUp(self):
        self.alice = User.objects.create_user("alice", password=PASSWORD)
        self.semester = Semester.objects.create(student=self.alice, name="Fall 2025", start_date=START, end_date=END)
        self.course = Course.objects.create(semester=self.semester, name="Machine Learning", code="CS401", credit=Decimal("3.0"))

    def assert_snake_links(self, response, nodes):
        self.assertContains(response, "data-snk")
        self.assertContains(response, "snk__svg--wide")
        self.assertContains(response, "snk__svg--tall")
        for node in nodes:
            self.assertContains(response, f'href="{reverse(node["url_name"])}{node["anchor"]}"')

    def test_guest_home(self):
        response = self.client.get(reverse("academic:home"))
        self.assertEqual(response.status_code, 200)
        self.assert_snake_links(response, response.context["snake"]["nodes"])
        self.assertContains(response, "Explore the demo dashboard")
        self.assertContains(response, "academic-snake.js")
        self.assertNotContains(response, "academic-dashboard.js")

    def test_guest_dashboard_says_demo_data_and_links_every_node(self):
        response = self.client.get(reverse("academic:dashboard"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Demo data")
        self.assertContains(response, "snk--journey")
        self.assert_snake_links(response, response.context["snake"]["nodes"])
        self.assertNotContains(response, "Fall 2025")

    def test_guest_preview_pages_are_labelled_and_have_no_forms(self):
        for name in ["course_list", "routine_list", "assignment_list", "holiday_list", "cgpa", "timeline",
                     "attendance_overview", "semester_list", "setup"]:
            response = self.client.get(reverse(f"academic:{name}"))
            self.assertContains(response, "Demo data", msg_prefix=name)
            self.assertContains(response, "Sign in", msg_prefix=name)
            self.assertNotContains(response, "<form", msg_prefix=name)
            self.assertNotContains(response, "csrfmiddlewaretoken", msg_prefix=name)

    def test_signed_in_dashboard_is_real_and_not_labelled_demo(self):
        Assignment.objects.create(semester=self.semester, course=self.course, title="Real HW", due_date=date(2025, 10, 10))
        self.client.login(username="alice", password=PASSWORD)
        response = self.client.get(reverse("academic:dashboard"))
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, "ac-demo")
        self.assertContains(response, "Fall 2025")
        self.assertContains(response, "Real HW")
        self.assert_snake_links(response, response.context["snake"]["nodes"])

    def test_home_timeline_comes_before_the_hero_and_the_hero_waits_for_it(self):
        html = self.client.get(reverse("academic:home")).content.decode()
        self.assertLess(html.index("data-snk role="), html.index('id="hm-title"'))
        self.assertIn("data-snk-gate", html)
        self.assertIn("data-after-snake", html)

    def test_dashboard_timeline_comes_before_heading_and_statistics(self):
        self.client.login(username="alice", password=PASSWORD)
        html = self.client.get(reverse("academic:dashboard")).content.decode()
        timeline = html.index("data-snk role=")
        self.assertLess(timeline, html.index('class="ac-page-head"'))
        self.assertLess(timeline, html.index('class="db-strip"'))
        self.assertLess(html.index('class="ac-page-head"'), html.index('class="db-strip"'))
        self.assertIn("data-snk-gate", html)

    def test_signed_in_home_has_no_guest_wording(self):
        self.client.login(username="alice", password=PASSWORD)
        response = self.client.get(reverse("academic:home"))
        self.assertContains(response, "Open dashboard")
        self.assertNotContains(response, "exploring as a guest")
