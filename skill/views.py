from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Avg, Count, Q
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from .forms import ProjectForm, SkillForm, SkillProgressForm
from .models import Project, Skill
from .recommendations import STARTER_SKILLS, next_skills_for

JUST_COMPLETED_KEY = "skill_just_completed"


def build_tree(skills, projects_by_skill=None):
    """Flat list -> nested nodes: {"skill": skill, "children": [...], "projects": [...]}."""
    projects_by_skill = projects_by_skill or {}
    nodes = {
        s.pk: {"skill": s, "children": [], "projects": projects_by_skill.get(s.pk, [])}
        for s in skills
    }
    roots = []
    for s in skills:
        parent = nodes.get(s.parent_id)
        (parent["children"] if parent else roots).append(nodes[s.pk])
    return roots



def open_suggestions(skill, owned_names):
    """Suggested skill names the user doesn't have yet."""
    return [n for n in next_skills_for(skill.name) if n.lower() not in owned_names]


def remember_completion(request, skill, was_completed):
    """Show the recommendation banner once, right after a skill reaches 100%."""
    if skill.is_completed and not was_completed:
        request.session[JUST_COMPLETED_KEY] = skill.pk


@login_required
def home(request):
    user_skills = Skill.objects.filter(user=request.user)
    project_qs = Project.objects.filter(user=request.user)

    # State A: nothing yet -> welcome page
    if not user_skills.exists() and not project_qs.exists():
        return render(request, "skill/home.html", {
            "configured": False,
            "starter_skills": STARTER_SKILLS,
        })

    # State B: dashboard
    skills = list(user_skills)
    owned_names = {s.name.lower() for s in skills}

    stats = user_skills.aggregate(
        total=Count("id"),
        completed=Count("id", filter=Q(status=Skill.Status.COMPLETED)),
        in_progress=Count("id", filter=Q(status=Skill.Status.IN_PROGRESS)),
        average=Avg("progress"),
    )
    stats["average"] = round(stats["average"] or 0)

    # Projects, grouped under every skill they are linked to
    all_projects = list(project_qs.prefetch_related("technologies", "related_skills"))
    projects_by_skill = {}
    for project in all_projects:
        for skill in project.related_skills.all():
            projects_by_skill.setdefault(skill.pk, []).append(project)

    # One suggestion block per completed skill that still has open suggestions
    recommendations = []
    for s in skills:
        if s.is_completed:
            names = open_suggestions(s, owned_names)
            if names:
                recommendations.append({"skill": s, "names": names})

    # Banner shown once after completing a skill
    just_completed, just_completed_names = None, []
    completed_pk = request.session.pop(JUST_COMPLETED_KEY, None)
    if completed_pk:
        just_completed = next((s for s in skills if s.pk == completed_pk), None)
        if just_completed:
            just_completed_names = open_suggestions(just_completed, owned_names)

    return render(request, "skill/home.html", {
        "configured": True,
        "skills": skills,
        "tree": build_tree(skills, projects_by_skill),
        "stats": stats,
        "recommendations": recommendations,
        "just_completed": just_completed,
        "just_completed_names": just_completed_names,
        "projects": all_projects[:6],
        "project_count": len(all_projects),
    })


# Skills

def initial_from_query(request):
    """Prefill the create form from a suggestion link: ?name=Django&parent=3"""
    initial = {"name": request.GET.get("name", "")[:80]}
    parent_id = request.GET.get("parent", "")
    if parent_id.isdigit():
        parent = Skill.objects.filter(user=request.user, pk=int(parent_id)).first()
        if parent:
            initial["parent"] = parent.pk
            initial["category"] = parent.category
    return initial


@login_required
def skill_create(request):
    if request.method == "POST":
        form = SkillForm(request.POST, user=request.user)
        if form.is_valid():
            skill = form.save()
            remember_completion(request, skill, was_completed=False)
            messages.success(request, f"{skill.name} added to your skill tree.")
            return redirect("skill:home")
    else:
        form = SkillForm(user=request.user, initial=initial_from_query(request))
    return render(request, "skill/skill_form.html", {"form": form, "skill": None})


@login_required
def skill_edit(request, pk):
    skill = get_object_or_404(Skill, pk=pk, user=request.user)
    was_completed = skill.is_completed
    if request.method == "POST":
        form = SkillForm(request.POST, instance=skill, user=request.user)
        if form.is_valid():
            skill = form.save()
            remember_completion(request, skill, was_completed)
            messages.success(request, f"{skill.name} updated.")
            return redirect("skill:home")
    else:
        form = SkillForm(instance=skill, user=request.user)
    return render(request, "skill/skill_form.html", {"form": form, "skill": skill})


@login_required
@require_POST
def skill_progress(request, pk):
    """Quick progress update from the dashboard (plain form POST)."""
    skill = get_object_or_404(Skill, pk=pk, user=request.user)
    form = SkillProgressForm(request.POST)
    if form.is_valid():
        was_completed = skill.is_completed
        skill.progress = form.cleaned_data["progress"]
        skill.save()
        remember_completion(request, skill, was_completed)
    else:
        messages.error(request, "Progress must be a number from 0 to 100.")
    return redirect("skill:home")


@login_required
@require_POST
def skill_delete(request, pk):
    skill = get_object_or_404(Skill, pk=pk, user=request.user)
    name = skill.name
    skill.delete()  # children become top-level skills
    messages.success(request, f"{name} deleted.")
    return redirect("skill:home")


# Projects

@login_required
def project_create(request):
    if request.method == "POST":
        form = ProjectForm(request.POST, request.FILES, user=request.user)
        if form.is_valid():
            project = form.save()
            messages.success(request, f"{project.name} added to your showcase.")
            return redirect("skill:project_detail", pk=project.pk)
    else:
        form = ProjectForm(user=request.user)
    return render(request, "skill/project_form.html", {"form": form, "project": None})


@login_required
def project_detail(request, pk):
    project = get_object_or_404(
        Project.objects.prefetch_related("technologies", "related_skills"),
        pk=pk, user=request.user,
    )
    return render(request, "skill/project_detail.html", {"project": project})


@login_required
def project_edit(request, pk):
    project = get_object_or_404(Project, pk=pk, user=request.user)
    if request.method == "POST":
        form = ProjectForm(request.POST, request.FILES, instance=project, user=request.user)
        if form.is_valid():
            project = form.save()
            messages.success(request, f"{project.name} updated.")
            return redirect("skill:project_detail", pk=project.pk)
    else:
        form = ProjectForm(instance=project, user=request.user)
    return render(request, "skill/project_form.html", {"form": form, "project": project})


@login_required
@require_POST
def project_delete(request, pk):
    project = get_object_or_404(Project, pk=pk, user=request.user)
    name = project.name
    project.delete()
    messages.success(request, f"{name} deleted.")
    return redirect("skill:home")