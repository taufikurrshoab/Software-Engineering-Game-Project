from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse


class AccountTests(TestCase):
    def test_signup_creates_user_and_logs_them_in(self):
        response = self.client.post(
            reverse('signup'),
            {
                'username': 'newplayer',
                'email': 'newplayer@example.com',
                'password1': 'StrongPass123',
                'password2': 'StrongPass123',
            },
        )

        self.assertRedirects(response, reverse('dashboard'))
        self.assertTrue(User.objects.filter(username='newplayer').exists())
        self.assertIn('_auth_user_id', self.client.session)
