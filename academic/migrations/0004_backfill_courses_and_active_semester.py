# Data only: turn every existing ClassSchedule.course_name into a Course and
# mark each student's latest semester as active. Safe to re-run; nothing is deleted.

from django.db import migrations


def backfill(apps, schema_editor):
    Semester = apps.get_model('academic', 'Semester')
    Course = apps.get_model('academic', 'Course')
    ClassSchedule = apps.get_model('academic', 'ClassSchedule')

    cache = {}
    pending = ClassSchedule.objects.filter(course__isnull=True).order_by('semester_id', 'id')
    for schedule in pending:
        name = (schedule.course_name or '').strip() or 'Untitled course'
        key = (schedule.semester_id, name.casefold())
        course = cache.get(key)
        if course is None:
            course = Course.objects.filter(
                semester_id=schedule.semester_id, name__iexact=name
            ).first()
            if course is None:
                course = Course.objects.create(semester_id=schedule.semester_id, name=name[:120])
            cache[key] = course
        schedule.course_id = course.id
        schedule.course_name = course.name[:100]
        schedule.save(update_fields=['course', 'course_name'])

    # Same rule the existing home view uses: latest start date, then newest row
    student_ids = Semester.objects.values_list('student_id', flat=True).distinct()
    for student_id in student_ids:
        semesters = Semester.objects.filter(student_id=student_id)
        if semesters.filter(is_active=True).exists():
            continue
        latest = semesters.order_by('-start_date', '-created_at').first()
        Semester.objects.filter(pk=latest.pk).update(is_active=True)


class Migration(migrations.Migration):

    dependencies = [
        ('academic', '0003_course_and_academic_models'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]