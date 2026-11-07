# Generated for the AI skill assessment feature.
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("skill", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Assessment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("active", "Active"), ("completed", "Completed")], default="active", max_length=12)),
                ("total_questions", models.PositiveSmallIntegerField(default=10)),
                ("answered_questions", models.PositiveSmallIntegerField(default=0)),
                ("next_difficulty", models.CharField(choices=[("beginner", "Beginner"), ("intermediate", "Intermediate"), ("advanced", "Advanced")], default="beginner", max_length=20)),
                ("score", models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("skill", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="assessments", to="skill.skill")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="skill_assessments", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-started_at"]},
        ),
        migrations.CreateModel(
            name="AssessmentQuestion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("question_number", models.PositiveSmallIntegerField()),
                ("topic", models.CharField(blank=True, max_length=100)),
                ("question_text", models.TextField()),
                ("options", models.JSONField()),
                ("correct_index", models.PositiveSmallIntegerField()),
                ("explanation", models.TextField()),
                ("difficulty", models.CharField(choices=[("beginner", "Beginner"), ("intermediate", "Intermediate"), ("advanced", "Advanced")], max_length=20)),
                ("selected_index", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("is_correct", models.BooleanField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("assessment", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="questions", to="skill.assessment")),
            ],
            options={"ordering": ["question_number"]},
        ),
        migrations.AddIndex(
            model_name="assessment",
            index=models.Index(fields=["user", "skill", "status"], name="sk_assess_usr_skill_status"),
        ),
        migrations.AddConstraint(
            model_name="assessmentquestion",
            constraint=models.UniqueConstraint(fields=("assessment", "question_number"), name="unique_skill_assessment_question"),
        ),
    ]
