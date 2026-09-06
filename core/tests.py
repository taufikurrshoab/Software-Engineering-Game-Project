from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse


class CorePageTests(TestCase):
    def test_home_page_loads(self):
        response = self.client.get(reverse('home'))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'GameForge')

    def test_dashboard_requires_login(self):
        response = self.client.get(reverse('dashboard'))

        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse('login'), response['Location'])

    def test_dashboard_loads_for_authenticated_user(self):
        User.objects.create_user(username='player1', password='StrongPass123')
        self.client.login(username='player1', password='StrongPass123')

        response = self.client.get(reverse('dashboard'))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Welcome, player1')
