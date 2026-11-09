# Constraints on tables that already hold data, added after the backfill.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic', '0004_backfill_courses_and_active_semester'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='semester',
            constraint=models.CheckConstraint(condition=models.Q(end_date__gt=models.F('start_date')), name='academic_semester_end_after_start', violation_error_message='End date must be after start date.'),
        ),
        migrations.AddConstraint(
            model_name='semester',
            constraint=models.UniqueConstraint(condition=models.Q(is_active=True), fields=('student',), name='academic_one_active_semester_per_student', violation_error_message='This student already has an active semester.'),
        ),
        migrations.AddConstraint(
            model_name='classschedule',
            constraint=models.CheckConstraint(condition=models.Q(end_time__gt=models.F('start_time')), name='academic_schedule_end_after_start', violation_error_message='End time must be after start time.'),
        ),
    ]