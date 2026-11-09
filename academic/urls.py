from django.urls import path

from . import views

app_name = "academic"

urlpatterns = [
    path("", views.home, name="home"),
    path("dashboard/", views.dashboard, name="dashboard"),

    # Semesters
    path("setup/", views.semester_setup, name="setup"),
    path("semesters/", views.semester_list, name="semester_list"),
    path("semesters/<int:pk>/edit/", views.semester_edit, name="semester_edit"),
    path("semesters/<int:pk>/activate/", views.semester_activate, name="semester_activate"),
    path("semesters/<int:pk>/delete/", views.semester_delete, name="semester_delete"),

    # Courses and grades
    path("courses/", views.course_list, name="course_list"),
    path("courses/<int:pk>/edit/", views.course_edit, name="course_edit"),
    path("courses/<int:pk>/delete/", views.course_delete, name="course_delete"),
    path("courses/<int:pk>/grade/", views.grade_edit, name="grade_edit"),
    path("courses/<int:pk>/grade/delete/", views.grade_delete, name="grade_delete"),
    path("cgpa/", views.cgpa, name="cgpa"),
    path("cgpa/semesters/add/", views.gpa_add, name="gpa_add"),
    path("cgpa/semesters/<int:pk>/edit/", views.gpa_edit, name="gpa_edit"),
    path("cgpa/semesters/<int:pk>/delete/", views.gpa_delete, name="gpa_delete"),

    # Weekly routine
    path("routine/", views.routine_list, name="routine_list"),
    path("routine/<int:pk>/edit/", views.routine_edit, name="routine_edit"),
    path("routine/<int:pk>/delete/", views.routine_delete, name="routine_delete"),
    path("routine/<int:pk>/cancel/", views.routine_cancel, name="routine_cancel"),
    path("routine/<int:pk>/restore/", views.routine_restore, name="routine_restore"),

    # Holidays
    path("holidays/", views.holiday_list, name="holiday_list"),
    path("holidays/<int:pk>/edit/", views.holiday_edit, name="holiday_edit"),
    path("holidays/<int:pk>/delete/", views.holiday_delete, name="holiday_delete"),

    # Assignments
    path("assignments/", views.assignment_list, name="assignment_list"),
    path("assignments/<int:pk>/edit/", views.assignment_edit, name="assignment_edit"),
    path("assignments/<int:pk>/toggle/", views.assignment_toggle, name="assignment_toggle"),
    path("assignments/<int:pk>/delete/", views.assignment_delete, name="assignment_delete"),

    # Timeline and attendance
    path("timeline/", views.timeline, name="timeline"),
    path("attendance/", views.attendance_overview, name="attendance_overview"),
    path("attendance/<int:pk>/mark/", views.attendance_mark, name="attendance_mark"),
]