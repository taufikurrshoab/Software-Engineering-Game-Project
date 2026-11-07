from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("skill", "0003_assessment_default_five_questions"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="LearningRecommendation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("suggestions", models.JSONField(blank=True, default=list)),
                ("based_on_progress", models.PositiveSmallIntegerField(default=0)),
                ("generated_at", models.DateTimeField(auto_now=True)),
                ("skill", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="learning_recommendations", to="skill.skill")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="learning_recommendations", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["skill_id"]},
        ),
        migrations.AddConstraint(
            model_name="learningrecommendation",
            constraint=models.UniqueConstraint(fields=("user", "skill"), name="unique_learning_recommendation_per_skill"),
        ),
    ]
