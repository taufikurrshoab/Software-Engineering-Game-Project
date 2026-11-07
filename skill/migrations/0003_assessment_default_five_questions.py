from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("skill", "0002_ai_assessment"),
    ]

    operations = [
        migrations.AlterField(
            model_name="assessment",
            name="total_questions",
            field=models.PositiveSmallIntegerField(default=5),
        ),
    ]
