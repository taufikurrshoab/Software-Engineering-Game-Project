# Schema only: new tables plus nullable/blank additions to existing ones.
# Existing rows are not touched here; 0004 backfills them.

from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academic', '0002_classschedule'),
    ]

    operations = [
        migrations.AddField(
            model_name='semester',
            name='is_active',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='Course',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('code', models.CharField(blank=True, max_length=20)),
                ('credit', models.DecimalField(decimal_places=1, default=Decimal('3.0'), max_digits=3)),
                ('teacher', models.CharField(blank=True, max_length=100)),
                ('color', models.CharField(default='#4F46E5', max_length=7)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('semester', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='courses', to='academic.semester')),
            ],
            options={
                'ordering': ['name'],
                'constraints': [
                    models.UniqueConstraint(fields=('semester', 'name'), name='academic_course_unique_name_per_semester', violation_error_message='This course already exists in the semester.'),
                    models.UniqueConstraint(condition=~models.Q(code=''), fields=('semester', 'code'), name='academic_course_unique_code_per_semester', violation_error_message='This course code is already used in the semester.'),
                    models.CheckConstraint(condition=models.Q(credit__gt=0), name='academic_course_credit_positive', violation_error_message='Credit must be greater than zero.'),
                ],
            },
        ),
        migrations.AddField(
            model_name='classschedule',
            name='course',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='weekly_classes', to='academic.course'),
        ),
        migrations.AlterField(
            model_name='classschedule',
            name='course_name',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.CreateModel(
            name='ClassSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('start_time', models.TimeField()),
                ('end_time', models.TimeField()),
                ('room', models.CharField(blank=True, max_length=50)),
                ('is_cancelled', models.BooleanField(default=False)),
                ('cancel_reason', models.CharField(blank=True, max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.RESTRICT, related_name='sessions', to='academic.course')),
                ('semester', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sessions', to='academic.semester')),
                ('weekly_class', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sessions', to='academic.classschedule')),
            ],
            options={
                'ordering': ['date', 'start_time'],
                'indexes': [
                    models.Index(fields=['semester', 'date'], name='academic_session_sem_date_idx'),
                ],
                'constraints': [
                    models.CheckConstraint(condition=models.Q(end_time__gt=models.F('start_time')), name='academic_session_end_after_start', violation_error_message='End time must be after start time.'),
                    models.UniqueConstraint(condition=models.Q(weekly_class__isnull=False), fields=('weekly_class', 'date'), name='academic_session_unique_routine_date', violation_error_message='A session already exists for this class on this date.'),
                ],
            },
        ),
        migrations.CreateModel(
            name='Attendance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('present', 'Present'), ('absent', 'Absent'), ('late', 'Late'), ('excused', 'Excused')], default='present', max_length=10)),
                ('note', models.CharField(blank=True, max_length=200)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('session', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='attendance', to='academic.classsession')),
            ],
        ),
        migrations.CreateModel(
            name='Holiday',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=100)),
                ('start_date', models.DateField()),
                ('end_date', models.DateField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('semester', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='holidays', to='academic.semester')),
            ],
            options={
                'ordering': ['start_date'],
                'constraints': [
                    models.CheckConstraint(condition=models.Q(end_date__gte=models.F('start_date')), name='academic_holiday_end_not_before_start', violation_error_message='End date cannot be before start date.'),
                ],
            },
        ),
        migrations.CreateModel(
            name='Assignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=150)),
                ('description', models.TextField(blank=True)),
                ('due_date', models.DateField()),
                ('is_completed', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignments', to='academic.course')),
                ('semester', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignments', to='academic.semester')),
            ],
            options={
                'ordering': ['due_date', 'id'],
            },
        ),
        migrations.CreateModel(
            name='CourseGrade',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('grade', models.CharField(max_length=5)),
                ('grade_point', models.DecimalField(decimal_places=2, max_digits=3)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('course', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='grade', to='academic.course')),
            ],
            options={
                'constraints': [
                    models.CheckConstraint(condition=models.Q(grade_point__gte=0, grade_point__lte=4), name='academic_grade_point_range', violation_error_message='Grade point must be between 0 and 4.'),
                ],
            },
        ),
    ]