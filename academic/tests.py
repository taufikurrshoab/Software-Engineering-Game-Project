from datetime import date, datetime, time
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.messages import get_messages
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from . import services
from .models import (
    Assignment,
    Attendance,
    ClassSchedule,
    ClassSession,
    Course,
    CourseGrade,
    Holiday,
    Semester,
)

User = get_user_model()
PASSWORD = "pw12345!"

# Views render these templates, which the frontend phase will create.
# The tests use stand-ins so the backend can be tested on its own.
TEMPLATE_NAMES = [
    "home", "semester_setup", "semester_list", "course_list", "course_form",
    "routine_list", "routine_form", "holiday_list", "holiday_form",
    "assignment_list", "assignment_form", "timeline", "attendance", "cgpa", "grade_form",
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
    def test_login_required(self):
        self.client.logout()
        for name in ["semester_list", "course_list", "routine_list", "holiday_list",
                     "assignment_list", "timeline", "attendance_overview", "cgpa"]:
            response = self.client.get(reverse(f"academic:{name}"))
            self.assertEqual(response.status_code, 302, name)

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