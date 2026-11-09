"""Tests for the snake geometry, the node destinations and the guest demo.

These need no database and no templates (snake.py, guest.py and journey.py are
plain Python), so they run with Django's SimpleTestCase.
"""

import inspect
import re
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace

from django.test import SimpleTestCase

from . import guest, journey, snake
from .snake import build_snake, feature_nodes, journey_nodes, journey_ticks

URLS_PY = (Path(__file__).parent / "urls.py").read_text()
URL_NAMES = set(re.findall(r'name="(\w+)"', URLS_PY))


def stats_for(semester, today):
    """The same numbers views.build_stats gives (kept here so these tests need no database)."""
    import math
    total_days = (semester.end_date - semester.start_date).days
    elapsed = min(max((today - semester.start_date).days, 0), total_days)
    total_weeks = math.ceil(total_days / 7)
    if today < semester.start_date:
        phase, week = "upcoming", 0
    elif today > semester.end_date:
        phase, week = "ended", total_weeks
    else:
        phase, week = "running", min(elapsed // 7 + 1, total_weeks)
    return {"phase": phase, "progress": round(elapsed / total_days * 100), "current_week": week,
            "total_weeks": total_weeks, "total_days": total_days, "days_elapsed": elapsed,
            "days_remaining": max((semester.end_date - today).days, 0),
            "days_until_start": max((semester.start_date - today).days, 0)}


def demo_journey(today):
    semester, courses, schedules, pending, holidays = guest.demo_semester(today)
    stats = stats_for(semester, today)
    return semester, stats, journey.build_journey(semester, today, stats, pending, holidays)


def url_name(node):
    return node["url_name"].split(":", 1)[1]


class GeometryTests(SimpleTestCase):
    def test_home_snake_has_one_node_per_feature_in_path_order(self):
        data = snake.home_snake()
        self.assertEqual(data["count"], 9)
        at = [float(n["at_w"]) for n in data["nodes"]]
        self.assertEqual(at, sorted(at))
        sides = [n["side"] for n in data["nodes"]]
        self.assertEqual(sides, ["up", "down", "down", "up", "up", "down", "up", "down", "up"])
        self.assertNotEqual(sides, ["up", "down"] * 4 + ["up"], "branches must not simply alternate")
        self.assertEqual(len({n["stem_w"].split(" C")[1].split()[-1] for n in data["nodes"]}), 9)
        self.assertIsNone(data["now"])
        self.assertEqual(data["ticks"], [])

    def test_wide_and_tall_paths_are_smooth_beziers(self):
        for count in (4, 6, 9):
            data = build_snake(feature_nodes()[:count])
            for layout in ("wide", "tall"):
                path = data[layout]["path"]
                self.assertTrue(path.startswith("M"))
                minimum = 5 if layout == "wide" else 3
                self.assertGreaterEqual(path.count("C"), minimum, "a winding line needs several curves, not a straight one")
                self.assertNotIn("L", path)
                self.assertNotIn("nan", path.lower())

    def test_positions_are_inside_their_canvas(self):
        data = snake.home_snake()
        for node in data["nodes"]:
            for key in ("x", "y", "mx", "my"):
                self.assertTrue(0 < float(node[key]) < 100, (key, node[key]))
            for key in ("at_w", "at_t"):
                self.assertTrue(0 < float(node[key]) < 1)
        self.assertEqual(data["wide"]["viewbox"], "0 0 1200 660")
        self.assertEqual(data["tall"]["viewbox"], f"0 0 360 {data['tall']['h']}")

    def test_stems_start_on_the_main_line_at_the_node_position(self):
        curve = snake._wide_curve()
        data = snake.home_snake()
        for node in data["nodes"]:
            x, y = curve.at(float(node["at_w"]))
            m = re.match(r"M([\d.\-]+) ([\d.\-]+) C", node["stem_w"])
            self.assertAlmostEqual(float(m.group(1)), x, delta=0.1)
            self.assertAlmostEqual(float(m.group(2)), y, delta=0.1)
            if node["side"] == "up":
                self.assertLess(node["wide_y"], y)
            else:
                self.assertGreater(node["wide_y"], y)

    def test_main_line_is_calm_not_a_repeating_wave(self):
        curve = snake._wide_curve()
        ys = [curve.at(k / 400)[1] for k in range(401)]
        turns = [k for k in range(1, 400) if (ys[k] - ys[k - 1]) * (ys[k + 1] - ys[k]) < 0]
        self.assertLessEqual(len(turns), 4, "few major bends in the main line")
        self.assertLess(max(ys) - min(ys), 60, "the main line stays calm")
        self.assertFalse(hasattr(snake, "_WIDE_WAVE"))

    def test_branches_differ_in_length_angle_and_curvature(self):
        data = snake.home_snake()
        reaches = {round(n["wide_x"] - float(re.match(r"M([\d.\-]+) ", n["stem_w"]).group(1))) for n in data["nodes"]}
        self.assertGreaterEqual(len(reaches), 7)
        self.assertGreaterEqual(len({n["wide_y"] for n in data["nodes"]}), 9)

    def test_feature_labels_are_compact(self):
        html = (Path(__file__).parent / "templates/academic/_snake.html").read_text()
        self.assertIn('item.kind != "feature"', html)

    def test_every_branch_leans_forward_and_its_label_fits_the_canvas(self):
        for count in range(1, 10):
            data = build_snake(feature_nodes()[:count])
            for node in data["nodes"]:
                junction_x = float(re.match(r"M([\d.\-]+) ", node["stem_w"]).group(1))
                self.assertGreater(node["wide_x"], junction_x)
                self.assertGreaterEqual(node["wide_x"] - data["tw"] / 2, 0)
                self.assertLessEqual(node["wide_x"] + data["tw"] / 2, snake.WIDE_W)

    def test_numbers_are_plain_strings_so_templates_never_localise_them(self):
        data = snake.home_snake()
        for node in data["nodes"]:
            for key in ("x", "y", "mx", "my", "at_w", "at_t"):
                self.assertIsInstance(node[key], str)
                self.assertRegex(node[key], r"^\d+(\.\d+)?$")
        self.assertRegex(data["tw_cq"], r"^\d+(\.\d+)?$")

    def test_text_width_never_exceeds_what_fits(self):
        for count in range(1, 10):
            data = build_snake(feature_nodes()[:count])
            self.assertLessEqual(data["tw"], 190)
            self.assertGreaterEqual(data["tw"], 120)

    def test_a_phone_node_is_moved_clear_of_the_today_label(self):
        nodes = feature_nodes()[:5]
        plain = build_snake(nodes)
        # put "today" exactly on the third node
        near = build_snake(nodes, now=(2 + 0.5) / 5, now_label="Today")
        self.assertNotEqual(plain["nodes"][2]["my"], near["nodes"][2]["my"])
        gap = abs(float(near["nodes"][2]["my"]) - float(near["now"]["my"])) / 100 * near["tall"]["h"]
        self.assertGreaterEqual(gap, 40)
        # the desktop layout is unaffected: its nodes sit away from the line
        self.assertEqual(plain["nodes"][2]["y"], near["nodes"][2]["y"])

    def test_today_marker_edges(self):
        nodes = feature_nodes()[:4]
        self.assertEqual(build_snake(nodes, now=0.0, now_label="t")["now"]["edge"], "start")
        self.assertEqual(build_snake(nodes, now=1.0, now_label="t")["now"]["edge"], "end")
        self.assertEqual(build_snake(nodes, now=0.5, now_label="t")["now"]["edge"], "")


class FeatureDestinationTests(SimpleTestCase):
    def test_every_feature_node_has_a_real_django_url_name(self):
        nodes = feature_nodes()
        self.assertEqual(len(nodes), 9)
        for node in nodes:
            self.assertTrue(node["url_name"].startswith("academic:"), node)
            self.assertIn(url_name(node), URL_NAMES, node["key"])
            self.assertTrue(node["title"] and node["text"] and node["icon"])
            self.assertIn(node["anchor"], ("", "#semesters"))

    def test_feature_keys_match_the_guest_previews(self):
        keys = {f["key"] for f in journey.home_features()}
        self.assertEqual(keys, set(guest.FEATURE_PREVIEW))


class JourneyNodeTests(SimpleTestCase):
    def test_each_kind_of_event_navigates_somewhere_meaningful(self):
        expected = {
            "start": ("semester_list", ""), "half": ("timeline", ""), "end": ("cgpa", "#semesters"),
            "empty": ("assignment_list", ""),
        }
        for kind, (name, anchor) in expected.items():
            event = {"kind": kind, "title": "T", "detail": "d", "relative": "", "state": "upcoming"}
            node = journey_nodes({"events": [event]})[0]
            self.assertEqual((url_name(node), node["anchor"]), (name, anchor), kind)
        a = journey_nodes({"events": [{"kind": "assignment", "title": "A", "detail": "C", "relative": "In 2 days",
                                       "state": "upcoming", "anchor": "#assignment-7", "color": "#6366f1"}]})[0]
        h = journey_nodes({"events": [{"kind": "holiday", "title": "H", "detail": "", "relative": "In 3 days",
                                       "state": "upcoming", "anchor": "#holiday-4"}]})[0]
        self.assertEqual((url_name(a), a["anchor"]), ("assignment_list", "#assignment-7"))
        self.assertEqual((url_name(h), h["anchor"]), ("holiday_list", "#holiday-4"))
        self.assertEqual(a["text"], "C \u00b7 In 2 days")
        self.assertEqual(h["text"], "In 3 days")

    def test_unsafe_colours_are_never_passed_to_a_style_attribute(self):
        for bad in ("red; background:url(x)", "#12", "javascript:1", None, "#12345678901"):
            event = {"kind": "assignment", "title": "A", "detail": "", "relative": "", "state": "upcoming",
                     "anchor": "#assignment-1", "color": bad}
            self.assertEqual(journey_nodes({"events": [event]})[0]["color"], "", bad)
        good = {"kind": "assignment", "title": "A", "detail": "", "relative": "", "state": "upcoming",
                "anchor": "#assignment-1", "color": "#6366f1"}
        self.assertEqual(journey_nodes({"events": [good]})[0]["color"], "#6366f1")

    def test_overdue_work_is_red_whatever_the_course_colour(self):
        event = {"kind": "assignment", "title": "A", "detail": "", "relative": "2 days late", "state": "overdue",
                 "anchor": "#assignment-1", "color": "#6366f1"}
        self.assertEqual(journey_nodes({"events": [event]})[0]["color"], "")

    def test_the_bright_line_stops_at_today(self):
        today = date(2026, 11, 8)
        semester, stats, j = demo_journey(today)
        data = snake.journey_snake(j, semester, today, stats["total_weeks"])
        self.assertAlmostEqual(float(data["now"]["at_w"]), j["now"] / 100, places=4)
        self.assertEqual(data["now"]["at_w"], data["now"]["at_t"])
        self.assertEqual(data["now"]["label"], j["now_label"])
        kinds = [n["kind"] for n in data["nodes"]]
        self.assertEqual(kinds, [e["kind"] for e in j["events"]])


class TickTests(SimpleTestCase):
    def test_one_tick_per_week_with_past_current_upcoming_states(self):
        today = date(2026, 11, 8)
        semester, stats, j = demo_journey(today)
        ticks = journey_ticks(j, semester, today, stats["total_weeks"])
        self.assertEqual([t["label"] for t in ticks], [f"W{i}" for i in range(1, 17)])
        states = [t["state"] for t in ticks]
        self.assertEqual(states.count("current"), 1)
        self.assertEqual(states[11], "current")
        self.assertTrue(all(s == "past" for s in states[:11]))
        self.assertTrue(all(s == "upcoming" for s in states[12:]))
        at = [t["at"] for t in ticks]
        self.assertEqual(at, sorted(at))
        self.assertTrue(all(0 <= a <= 1 for a in at))

    def test_a_very_long_semester_gets_fewer_ticks(self):
        today = date(2026, 3, 1)
        semester = SimpleNamespace(start_date=date(2026, 1, 5), end_date=date(2026, 1, 5) + timedelta(weeks=40) - timedelta(days=1))
        j = journey.build_journey(semester, today, stats_for(semester, today), [], [])
        ticks = journey_ticks(j, semester, today, 40)
        self.assertLessEqual(len(ticks), 16)
        self.assertEqual(sum(t["state"] == "current" for t in ticks), 1)

    def test_ticks_near_a_node_hide_their_label(self):
        data = build_snake(feature_nodes()[:4], ticks=[{"at": 0.125, "label": "W1", "state": "past"},
                                                        {"at": 0.25, "label": "W2", "state": "past"}])
        self.assertTrue(data["ticks"][0]["quiet"])
        self.assertFalse(data["ticks"][1]["quiet"])


class GuestDemoTests(SimpleTestCase):
    def test_demo_is_always_in_week_12_of_16_whatever_today_is(self):
        for offset in range(0, 800, 3):
            today = date(2026, 1, 1) + timedelta(days=offset)
            semester, stats, j = demo_journey(today)
            self.assertEqual((stats["phase"], stats["current_week"], stats["total_weeks"]), ("running", 12, 16), today)

    def test_demo_anchors_are_unique_so_every_timeline_node_has_its_own_destination(self):
        _, courses, schedules, pending, holidays = guest.demo_semester(date(2026, 11, 8))
        self.assertEqual(len({a.pk for a in pending}), len(pending))
        self.assertTrue(all(a.pk > 0 for a in pending) and all(h.pk > 0 for h in holidays))
        _, _, j = demo_journey(date(2026, 11, 8))
        anchors = [e["anchor"] for e in j["events"] if e["kind"] in ("assignment", "holiday")]
        self.assertEqual(len(anchors), len(set(anchors)), anchors)

    def test_demo_numbers_match_what_the_home_page_shows(self):
        semester, courses, schedules, pending, holidays = guest.demo_semester(date(2026, 11, 8))
        d = journey.DEMO_SEMESTER
        self.assertEqual((len(courses), len(schedules), len(pending)), (d["courses"], d["weekly_classes"], d["pending"]))

    def test_demo_objects_are_plain_in_memory_objects(self):
        semester, courses, schedules, pending, holidays = guest.demo_semester(date(2026, 11, 8))
        for obj in [semester, *courses, *schedules, *pending, *holidays]:
            self.assertIsInstance(obj, SimpleNamespace)
        source = inspect.getsource(guest)
        for pattern in (r"import django", r"from django", r"from \.models", r"\.objects\b", r"\.save\(", r"\.create\(", r"\bbulk_create\b"):
            self.assertIsNone(re.search(pattern, source), pattern)

    def test_every_preview_has_points_and_a_labelled_sample_where_there_is_one(self):
        for key, points in guest.FEATURE_PREVIEW.items():
            self.assertEqual(len(points), 3, key)
            rows = guest.preview_sample(key, date(2026, 11, 8))
            self.assertTrue(rows, key)
            for row in rows:
                self.assertEqual(set(row), {"title", "meta", "color", "dom_id"})
                self.assertTrue(row["title"] and row["meta"])
        self.assertIsNone(guest.preview_sample("nope", date(2026, 11, 8)))

    def test_preview_rows_carry_the_same_ids_the_journey_links_to(self):
        rows = {r["dom_id"] for r in guest.preview_sample("assignments", date(2026, 11, 8))}
        rows |= {r["dom_id"] for r in guest.preview_sample("holidays", date(2026, 11, 8))}
        _, _, j = demo_journey(date(2026, 11, 8))
        for event in j["events"]:
            if event["kind"] in ("assignment", "holiday"):
                self.assertIn(event["anchor"].lstrip("#"), rows)

    def test_sample_attendance_adds_up_to_the_demo_figure(self):
        held = sum(h for _, h, _ in guest._ATTENDANCE)
        attended = sum(a for _, _, a in guest._ATTENDANCE)
        self.assertEqual(round(attended / held * 100), journey.DEMO_SEMESTER["attendance"])
