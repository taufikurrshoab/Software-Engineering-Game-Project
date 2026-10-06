from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import Semester

User = get_user_model()


class AcademicAccessTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user("alice", password="pw12345!")
        self.bob = User.objects.create_user("bob", password="pw12345!")
        Semester.objects.create(
            student=self.alice, name="Alice Sem",
            start_date=date(2026, 9, 1), end_date=date(2027, 1, 31),
        )

    def test_login_required(self):
        response = self.client.get(reverse("academic:home"))
        self.assertEqual(response.status_code, 302)

    def test_user_only_sees_own_semester(self):
        self.client.login(username="bob", password="pw12345!")
        response = self.client.get(reverse("academic:home"))
        self.assertIsNone(response.context["semester"])
        self.assertNotContains(response, "Alice Sem")

    def test_setup_creates_semester_and_routine(self):
        self.client.login(username="bob", password="pw12345!")
        response = self.client.post(reverse("academic:setup"), {
            "name": "Bob Sem", "start_date": "2026-09-01", "end_date": "2027-01-31",
            "routine-TOTAL_FORMS": "1", "routine-INITIAL_FORMS": "0",
            "routine-MIN_NUM_FORMS": "0", "routine-MAX_NUM_FORMS": "1000",
            "routine-0-day_of_week": "6", "routine-0-course_name": "ML",
            "routine-0-start_time": "10:00", "routine-0-end_time": "11:00",
            "routine-0-room": "302",
        })
        self.assertRedirects(response, reverse("academic:home"))
        sem = Semester.objects.get(student=self.bob)
        self.assertEqual(sem.class_schedules.count(), 1)