# Semester-wise GPA records (new table; existing data is not touched).

import decimal

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic', '0005_semester_and_schedule_constraints'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='SemesterGPA',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('term', models.PositiveSmallIntegerField(validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(99)])),
                ('gpa', models.DecimalField(decimal_places=2, max_digits=3, validators=[django.core.validators.MinValueValidator(decimal.Decimal('0')), django.core.validators.MaxValueValidator(decimal.Decimal('4'))])),
                ('credits', models.DecimalField(blank=True, decimal_places=1, max_digits=5, null=True, validators=[django.core.validators.MinValueValidator(decimal.Decimal('0.1'))])),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='gpa_records', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'semester GPA',
                'verbose_name_plural': 'semester GPAs',
                'ordering': ['term', 'id'],
            },
        ),
        migrations.AddConstraint(
            model_name='semestergpa',
            constraint=models.UniqueConstraint(fields=('student', 'term'), name='academic_gpa_unique_term_per_student', violation_error_message='You already have a record for this semester number.'),
        ),
        migrations.AddConstraint(
            model_name='semestergpa',
            constraint=models.CheckConstraint(condition=models.Q(('gpa__gte', 0), ('gpa__lte', 4)), name='academic_gpa_range', violation_error_message='GPA must be between 0 and 4.'),
        ),
        migrations.AddConstraint(
            model_name='semestergpa',
            constraint=models.CheckConstraint(condition=models.Q(('credits__isnull', True), ('credits__gt', 0), _connector='OR'), name='academic_gpa_credits_positive', violation_error_message='Credits must be greater than zero.'),
        ),
    ]
