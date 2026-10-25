from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .forms import SkillForm
from .models import Skill, Project

User = get_user_model()


class SkillTestBase(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user("alice", password="pw12345!")
        self.bob = User.objects.create_user("bob", password="pw12345!")
        self.client.login(username="alice", password="pw12345!")


class AccessTests(SkillTestBase):
    def test_login_required(self):
        self.client.logout()
        response = self.client.get(reverse("skill:home"))
        self.assertEqual(response.status_code, 302)

    def test_new_user_sees_welcome_page(self):
        response = self.client.get(reverse("skill:home"))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.context["configured"])
        self.assertContains(response, "Start My Skill Journey")

    def test_user_with_skills_sees_dashboard_with_real_numbers(self):
        Skill.objects.create(user=self.alice, name="Python", progress=100)
        Skill.objects.create(user=self.alice, name="Django", progress=50)
        response = self.client.get(reverse("skill:home"))
        self.assertTrue(response.context["configured"])
        stats = response.context["stats"]
        self.assertEqual(stats["total"], 2)
        self.assertEqual(stats["completed"], 1)
        self.assertEqual(stats["in_progress"], 1)
        self.assertEqual(stats["average"], 75)

    def test_other_users_skills_are_not_shown(self):
        Skill.objects.create(user=self.bob, name="Secret skill", progress=40)
        response = self.client.get(reverse("skill:home"))
        self.assertFalse(response.context["configured"])
        self.assertNotContains(response, "Secret skill")


class OwnershipTests(SkillTestBase):
    def setUp(self):
        super().setUp()
        self.bobs_skill = Skill.objects.create(user=self.bob, name="Rust", progress=10)

    def test_cannot_edit_other_users_skill(self):
        response = self.client.get(reverse("skill:skill_edit", args=[self.bobs_skill.pk]))
        self.assertEqual(response.status_code, 404)

    def test_cannot_update_progress_of_other_users_skill(self):
        response = self.client.post(
            reverse("skill:skill_progress", args=[self.bobs_skill.pk]), {"progress": 90}
        )
        self.assertEqual(response.status_code, 404)
        self.bobs_skill.refresh_from_db()
        self.assertEqual(self.bobs_skill.progress, 10)

    def test_cannot_delete_other_users_skill(self):
        response = self.client.post(reverse("skill:skill_delete", args=[self.bobs_skill.pk]))
        self.assertEqual(response.status_code, 404)
        self.assertTrue(Skill.objects.filter(pk=self.bobs_skill.pk).exists())

    def test_cannot_use_other_users_skill_as_parent(self):
        response = self.client.post(reverse("skill:skill_create"), {
            "name": "Cargo", "category": "tools", "parent": self.bobs_skill.pk, "progress": 0,
        })
        self.assertEqual(response.status_code, 200)  # form re-shown with an error
        self.assertFalse(Skill.objects.filter(user=self.alice, name="Cargo").exists())

    def test_delete_requires_post(self):
        mine = Skill.objects.create(user=self.alice, name="Go")
        response = self.client.get(reverse("skill:skill_delete", args=[mine.pk]))
        self.assertEqual(response.status_code, 405)


class SkillCreationTests(SkillTestBase):
    def test_create_skill_redirects_to_dashboard(self):
        response = self.client.post(reverse("skill:skill_create"), {
            "name": "Python", "category": "programming", "parent": "", "progress": 100,
        })
        self.assertRedirects(response, reverse("skill:home"))
        skill = Skill.objects.get(user=self.alice, name="Python")
        self.assertEqual(skill.status, Skill.Status.COMPLETED)

    def test_empty_name_is_rejected(self):
        response = self.client.post(reverse("skill:skill_create"), {
            "name": "", "category": "other", "parent": "", "progress": 0,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Skill.objects.count(), 0)

    def test_progress_out_of_range_is_rejected(self):
        response = self.client.post(reverse("skill:skill_create"), {
            "name": "Python", "category": "other", "parent": "", "progress": 150,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Skill.objects.count(), 0)

    def test_duplicate_name_ignores_case(self):
        Skill.objects.create(user=self.alice, name="Python")
        response = self.client.post(reverse("skill:skill_create"), {
            "name": "python", "category": "other", "parent": "", "progress": 0,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Skill.objects.filter(user=self.alice).count(), 1)

    def test_same_name_allowed_for_different_users(self):
        Skill.objects.create(user=self.bob, name="Python")
        self.client.post(reverse("skill:skill_create"), {
            "name": "Python", "category": "other", "parent": "", "progress": 0,
        })
        self.assertTrue(Skill.objects.filter(user=self.alice, name="Python").exists())

    def test_completing_a_skill_shows_recommendations_once(self):
        self.client.post(reverse("skill:skill_create"), {
            "name": "Python", "category": "programming", "parent": "", "progress": 100,
        })
        first = self.client.get(reverse("skill:home"))
        self.assertEqual(first.context["just_completed"].name, "Python")
        self.assertEqual(first.context["just_completed_names"], ["Django", "Machine Learning"])
        second = self.client.get(reverse("skill:home"))
        self.assertIsNone(second.context["just_completed"])

    def test_recommendation_hidden_if_user_already_has_it(self):
        Skill.objects.create(user=self.alice, name="Django")
        self.client.post(reverse("skill:skill_create"), {
            "name": "Python", "category": "programming", "parent": "", "progress": 100,
        })
        response = self.client.get(reverse("skill:home"))
        self.assertEqual(response.context["just_completed_names"], ["Machine Learning"])


class RuleTests(SkillTestBase):
    def test_status_follows_progress(self):
        skill = Skill.objects.create(user=self.alice, name="C", progress=0)
        self.assertEqual(skill.status, Skill.Status.NOT_STARTED)
        skill.progress = 40
        skill.save()
        self.assertEqual(skill.status, Skill.Status.IN_PROGRESS)
        skill.progress = 100
        skill.save()
        self.assertEqual(skill.status, Skill.Status.COMPLETED)
        self.assertIsNotNone(skill.completed_at)
        skill.progress = 90
        skill.save()
        self.assertIsNone(skill.completed_at)

    def test_quick_progress_update(self):
        skill = Skill.objects.create(user=self.alice, name="SQL", progress=10)
        response = self.client.post(reverse("skill:skill_progress", args=[skill.pk]), {"progress": 100})
        self.assertRedirects(response, reverse("skill:home"))
        skill.refresh_from_db()
        self.assertEqual(skill.status, Skill.Status.COMPLETED)

    def test_invalid_quick_progress_changes_nothing(self):
        skill = Skill.objects.create(user=self.alice, name="SQL", progress=10)
        self.client.post(reverse("skill:skill_progress", args=[skill.pk]), {"progress": 500})
        skill.refresh_from_db()
        self.assertEqual(skill.progress, 10)

    def test_skill_cannot_become_child_of_its_own_descendant(self):
        a = Skill.objects.create(user=self.alice, name="A")
        b = Skill.objects.create(user=self.alice, name="B", parent=a)
        c = Skill.objects.create(user=self.alice, name="C", parent=b)
        form = SkillForm({"name": "A", "category": "other", "parent": c.pk, "progress": 0},
                         instance=a, user=self.alice)
        self.assertFalse(form.is_valid())
        self.assertIn("parent", form.errors)

    def test_skill_cannot_be_its_own_parent(self):
        a = Skill.objects.create(user=self.alice, name="A")
        form = SkillForm({"name": "A", "category": "other", "parent": a.pk, "progress": 0},
                         instance=a, user=self.alice)
        self.assertFalse(form.is_valid())

    def test_deleting_parent_keeps_children_as_top_level(self):
        parent = Skill.objects.create(user=self.alice, name="Python")
        child = Skill.objects.create(user=self.alice, name="Django", parent=parent)
        self.client.post(reverse("skill:skill_delete", args=[parent.pk]))
        child.refresh_from_db()
        self.assertIsNone(child.parent)

class ProjectTreeTests(SkillTestBase):
    def test_project_appears_under_its_related_skill(self):
        django = Skill.objects.create(user=self.alice, name="Django")
        project = Project.objects.create(user=self.alice, name="Tic Tac Toe", description="x")
        project.related_skills.add(django)
        response = self.client.get(reverse("skill:home"))
        node = response.context["tree"][0]
        self.assertEqual([p.name for p in node["projects"]], ["Tic Tac Toe"])
        self.assertContains(response, "data-pnode")

    def test_project_linked_to_two_skills_shows_under_both(self):
        html = Skill.objects.create(user=self.alice, name="HTML")
        css = Skill.objects.create(user=self.alice, name="CSS")
        project = Project.objects.create(user=self.alice, name="Portfolio", description="x")
        project.related_skills.add(html, css)
        tree = self.client.get(reverse("skill:home")).context["tree"]
        for node in tree:
            self.assertEqual(len(node["projects"]), 1)

    def test_unlinked_project_is_not_in_tree(self):
        Skill.objects.create(user=self.alice, name="Python")
        Project.objects.create(user=self.alice, name="Loose", description="x")
        response = self.client.get(reverse("skill:home"))
        self.assertEqual(response.context["tree"][0]["projects"], [])
        self.assertNotContains(response, "data-pnode")