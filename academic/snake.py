"""Geometry for the branching timelines (Academic home page and dashboard): one flowing main
line with a twig leaving it for every node, in the manner of a plant stem.

build_snake()     turns a list of nodes into everything _snake.html draws: the
                  wide (desktop) and tall (phone) Bezier paths, one branch per
                  node, where each node sits (as percentages of its canvas) and
                  how far along the line it is (a 0-1 fraction of the path's
                  length, which is what academic-snake.js reads).
feature_nodes()   the nine Academic features as nodes (home page).
journey_nodes()   the semester journey events as nodes (dashboard), each with
                  the Django URL name it navigates to.
journey_ticks()  week ticks for the dashboard line.
home_snake(), journey_snake()   the two calls the views make.

Plain Python: no Django, no database, no clock. Everything is derived from the
arguments, so it is safe to call for a real user's journey and for the
in-memory guest demo alike. Numbers are returned already formatted as strings
so templates never localise them (a comma decimal would break SVG and CSS).

Layout: nodes are spread along the line by arc length, the same way
journey._now_position spreads events, so "today" always sits between its
neighbouring events on both layouts.
"""

import math
import re
from bisect import bisect_right
from datetime import timedelta

from .journey import _now_position, home_features

# ---------------------------------------------------------------- constants

WIDE_W, WIDE_H = 1200, 660      # the CSS default --ar-wide is 1200 / 660
TALL_W = 360                    # the CSS default --ar-tall is 360 / <height>

# The main line is calm: a long, gentle drift with only a couple of soft bends (never a repeating
# wave). It stops short of the right edge so the last branch, which leans forward, still fits.
_WIDE_X0, _WIDE_X1, _WIDE_CY = 64.0, 1040.0, 330.0
# (x as a fraction of the line, y offset from the centre line)
_WIDE_LINE = ((0.0, 16), (0.23, 2), (0.45, -18), (0.66, -4), (0.85, 12), (1.0, 4))
# Branches are organic, not alternating: each entry is (side, reach, tip_y, curve). reach is how far
# the branch leans forward along the line, tip_y where it ends. Lengths, angles and curves all
# differ. Two neighbours on the same side always go short then long, so they never cross and
# their labels sit at different heights. The table repeats for longer journeys.
_BRANCHES = (
    ("up", 120, 170, 0), ("down", 85, 425, 1), ("down", 140, 505, 2),
    ("up", 70, 248, 3), ("up", 130, 165, 4), ("down", 105, 462, 0),
    ("up", 95, 218, 1), ("down", 145, 515, 4), ("up", 80, 245, 2),
)
# control points of a branch as fractions of (reach, rise): (x1, y1, x2, y2)
_CURVES = ((0.45, 0.16, 0.80, 0.60), (0.30, 0.30, 0.65, 0.85), (0.55, 0.08, 0.90, 0.45),
           (0.20, 0.35, 0.55, 0.95), (0.60, 0.20, 0.95, 0.70))

# Phone layout: the same calm, irregular drift as the desktop line, turned to run downwards. The line
# stays in the left third (x between about 32 and 68) so the branches and labels to its right always fit.
# One stretch of line is (share of the stretch, x); it ends where it began so stretches join smoothly,
# and each repeat is scaled a little differently. Direction changes are few and never alternate evenly.
_TALL_UNIT = 600.0
_TALL_RUN = ((0.0, 46), (0.17, 55), (0.36, 66), (0.53, 60), (0.74, 38), (0.90, 42))
_TALL_SCALE = (1.0, 0.7, 0.9)
_TALL_MID = 52.0
# phone branches differ too: how far each leans right, how far it runs down, and its curve (x1, y1, x2, y2)
_TALL_REACHES = (46, 54, 40, 50, 38)
_TALL_DROP = (16, 32, 12, 26, 20)
_TALL_CURVES = ((0.45, 0.12, 0.82, 0.62), (0.30, 0.22, 0.70, 0.80), (0.55, 0.06, 0.90, 0.50))

_SAMPLES = 40                   # points per Bezier segment when measuring length
_QUIET_PX = 34                  # week labels this close to a node are hidden
_NOW_CLEAR_PX = 44              # on phones a node this close to "today" is moved out of its way
_NOW_PUSH_PX = 50
_COLOR = re.compile(r"^#[0-9a-fA-F]{3,8}$")


# ---------------------------------------------------------------- curves

def _cubic(p0, p1, p2, p3, t):
    u = 1 - t
    a, b, c, d = u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t
    return (a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
            a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1])


def _num(value):
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text if text not in ("", "-0") else "0"


def _pt(point):
    return f"{_num(point[0])} {_num(point[1])}"


class _Curve:
    """A chain of cubic Beziers that can be asked for the point at a fraction of its length."""

    def __init__(self, segments):
        self.segments = segments
        self.points = [segments[0][0]]
        self.cum = [0.0]
        for p0, p1, p2, p3 in segments:
            for step in range(1, _SAMPLES + 1):
                x, y = _cubic(p0, p1, p2, p3, step / _SAMPLES)
                px, py = self.points[-1]
                self.cum.append(self.cum[-1] + math.hypot(x - px, y - py))
                self.points.append((x, y))
        self.length = self.cum[-1]

    def at(self, fraction):
        distance = min(max(fraction, 0.0), 1.0) * self.length
        i = min(max(bisect_right(self.cum, distance), 1), len(self.cum) - 1)
        span = self.cum[i] - self.cum[i - 1]
        k = (distance - self.cum[i - 1]) / span if span else 0.0
        (x0, y0), (x1, y1) = self.points[i - 1], self.points[i]
        return (x0 + (x1 - x0) * k, y0 + (y1 - y0) * k)

    def path(self):
        first = self.segments[0][0]
        parts = [f"M{_pt(first)}"]
        for _p0, p1, p2, p3 in self.segments:
            parts.append(f"C{_pt(p1)} {_pt(p2)} {_pt(p3)}")
        return " ".join(parts)


def _smooth(points):
    """Cubic Bezier segments through every point (Catmull-Rom), so the line flows through
    uneven anchors without the regular S-bends that equal tangents would give."""
    pts = [points[0]] + list(points) + [points[-1]]
    segments = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        segments.append((p1, c1, c2, p2))
    return segments


def _wide_curve():
    anchors = [(_WIDE_X0 + f * (_WIDE_X1 - _WIDE_X0), _WIDE_CY + dy) for f, dy in _WIDE_LINE]
    return _Curve(_smooth(anchors))


def _tall_height(count):
    return 150 + 128 * max(count, 1)


def _tall_curve(height):
    top, bottom = 24.0, height - 24.0
    span = bottom - top
    anchors, repeat = [], 0
    while repeat * _TALL_UNIT < span:
        scale = _TALL_SCALE[repeat % len(_TALL_SCALE)]
        for share, x in _TALL_RUN:
            y = repeat * _TALL_UNIT + share * _TALL_UNIT
            if y >= span - 40:                      # keep the last anchor well clear of the end
                break
            anchors.append((_TALL_MID + (x - _TALL_MID) * scale, top + y))
        repeat += 1
    anchors.append((anchors[-1][0] + (_TALL_RUN[0][1] - anchors[-1][0]) * 0.4, bottom))
    return _Curve(_smooth(anchors))


# ---------------------------------------------------------------- build_snake

def _pct(value, whole):
    return f"{value / whole * 100:.2f}"


def _frac(value):
    return f"{min(max(value, 0.0), 1.0):.5f}"


def build_snake(nodes, now=None, now_label="", ticks=()):
    """Geometry for a list of nodes.

    nodes      dicts with at least title, text, icon, url_name (see feature_nodes)
    now        0-1 position of "today" along the line, or None (home page)
    now_label  the text next to the today marker
    ticks      dicts with "at" (0-1), "label" and "state" (see journey_ticks)
    """
    nodes = list(nodes)
    count = len(nodes)
    wide = _wide_curve()
    tall_h = _tall_height(count)
    tall = _tall_curve(tall_h)
    quiet_zone = _QUIET_PX / max(wide.length, tall.length)
    now_at = None if now is None else min(max(now, 0.0), 1.0)

    items = []
    for i, node in enumerate(nodes):
        at = (i + 0.5) / count
        side, reach, ey, curve = _BRANCHES[i % len(_BRANCHES)]
        sign = -1 if side == "up" else 1

        # wide: the branch leaves the line and bends to a node above or below it
        jx, jy = wide.at(at)
        ex = jx + reach                                  # every branch leans forward along the line
        dx, dy = ex - jx, ey - jy
        a, b, c, d = _CURVES[curve]
        stem_w = (f"M{_pt((jx, jy))} C{_pt((jx + dx * a, jy + dy * b))} "
                  f"{_pt((jx + dx * c, jy + dy * d))} {_pt((ex, ey))}")

        # tall: a short branch leaning down and to the right, with slightly different drops. A node that
        # would sit under the "today" label is moved away from it (today itself never moves).
        tx, ty = tall.at(at)
        nudge = _TALL_DROP[i % len(_TALL_DROP)]          # a phone branch runs forward (down) as it goes right
        if now_at is not None and abs(at - now_at) * tall.length < _NOW_CLEAR_PX:
            nudge = _NOW_PUSH_PX if at >= now_at else -_NOW_PUSH_PX
        nx, ny = tx + _TALL_REACHES[i % len(_TALL_REACHES)], ty + nudge
        rx, ry = nx - tx, ny - ty
        a2, b2, c2, d2 = _TALL_CURVES[i % len(_TALL_CURVES)]
        stem_t = (f"M{_pt((tx, ty))} C{_pt((tx + rx * a2, ty + ry * b2))} "
                  f"{_pt((tx + rx * c2, ty + ry * d2))} {_pt((nx, ny))}")

        item = dict(node)
        item.update({
            "index": i, "side": side, "sign": sign,
            "at_w": _frac(at), "at_t": _frac(at),
            "x": _pct(ex, WIDE_W), "y": _pct(ey, WIDE_H),
            "mx": _pct(nx, TALL_W), "my": _pct(ny, tall_h),
            "stem_w": stem_w, "stem_t": stem_t,
            "wide_x": ex, "wide_y": ey, "tall_x": nx, "tall_y": ny,
        })
        items.append(item)

    placed = []
    for tick in ticks:
        at = min(max(tick["at"], 0.0), 1.0)
        wx, wy = wide.at(at)
        tx, ty = tall.at(at)
        placed.append({
            "label": tick["label"], "state": tick.get("state", ""),
            "at_w": _frac(at), "at_t": _frac(at),
            "x": _pct(wx, WIDE_W), "y": _pct(wy, WIDE_H),
            "mx": _pct(tx, TALL_W), "my": _pct(ty, tall_h),
            "quiet": any(abs(at - (j + 0.5) / count) < quiet_zone for j in range(count)),
        })

    marker = None
    if now is not None:
        at = min(max(now, 0.0), 1.0)
        wx, wy = wide.at(at)
        tx, ty = tall.at(at)
        marker = {
            "label": now_label, "at_w": _frac(at), "at_t": _frac(at),
            "x": _pct(wx, WIDE_W), "y": _pct(wy, WIDE_H),
            "mx": _pct(tx, TALL_W), "my": _pct(ty, tall_h),
            "edge": "start" if at < 0.1 else ("end" if at > 0.9 else ""),
        }

    # text width: as wide as possible without touching the next node on the same side
    tw = 190
    for side in ("up", "down"):
        same = [it for it in items if it["side"] == side]
        # neighbours whose tips sit at clearly different heights cannot collide
        gaps = [b["wide_x"] - a["wide_x"] for a, b in zip(same, same[1:])
                if abs(b["wide_y"] - a["wide_y"]) < 60]
        if gaps:
            tw = min(tw, int(min(gaps)) - 22)
    if items:
        tw = min(tw, int(2 * min(items[0]["wide_x"], WIDE_W - items[-1]["wide_x"])) - 6)

    return {
        "count": count,
        "wide": {"w": WIDE_W, "h": WIDE_H, "viewbox": f"0 0 {WIDE_W} {WIDE_H}",
                 "ratio": f"{WIDE_W} / {WIDE_H}", "path": wide.path(), "length": wide.length},
        "tall": {"w": TALL_W, "h": tall_h, "viewbox": f"0 0 {TALL_W} {tall_h}",
                 "ratio": f"{TALL_W} / {tall_h}", "path": tall.path(), "length": tall.length},
        "tw": max(tw, 120),
        "tw_cq": f"{max(tw, 120) / WIDE_W * 100:.2f}",     # the same width as a share of the canvas
        "nodes": items,
        "ticks": placed,
        "now": marker,
    }


# ---------------------------------------------------------------- nodes

def _safe_color(value):
    return value if isinstance(value, str) and _COLOR.match(value) else ""


def feature_nodes(features=None):
    """The Academic features (home page). Each one links to its feature page."""
    nodes = []
    for feature in (features if features is not None else home_features()):
        nodes.append({
            "kind": "feature", "key": feature["key"], "title": feature["title"],
            "text": feature["text"], "icon": feature["icon"],
            "url_name": feature["url_name"], "anchor": feature.get("anchor", ""),
            "state": "", "color": "",
            "aria": f"{feature['title']}: {feature['text']}",
        })
    return nodes


_JOURNEY_ICONS = {
    "start": "calendar", "half": "chart", "end": "award",
    "assignment": "clipboard", "holiday": "sun", "empty": "check",
}
# where each kind of event leads; assignments and holidays use their own anchor
_JOURNEY_TARGETS = {
    "start": ("academic:semester_list", ""),
    "half": ("academic:timeline", ""),
    "end": ("academic:cgpa", "#semesters"),
    "empty": ("academic:assignment_list", ""),
}


def journey_nodes(journey):
    """The dashboard's semester journey events (journey.build_journey) as nodes."""
    nodes = []
    for event in journey["events"]:
        kind = event["kind"]
        if kind == "assignment":
            url_name, anchor = "academic:assignment_list", event.get("anchor", "")
        elif kind == "holiday":
            url_name, anchor = "academic:holiday_list", event.get("anchor", "")
        else:
            url_name, anchor = _JOURNEY_TARGETS[kind]

        text = event["detail"]
        if event.get("relative"):
            text = f"{text} \u00b7 {event['relative']}" if text else event["relative"]
        state = event["state"]
        nodes.append({
            "kind": kind, "key": kind, "title": event["title"], "text": text,
            "icon": _JOURNEY_ICONS[kind], "url_name": url_name, "anchor": anchor,
            "state": state,
            # an overdue deadline is red, whatever the course colour is
            "color": _safe_color(event.get("color")) if kind == "assignment" and state != "overdue" else "",
            "aria": f"{event['title']}: {text}",
        })
    return nodes


def journey_ticks(journey, semester, today, total_weeks):
    """One small tick per week start (every few weeks for a very long semester)."""
    dates = [event["sort_date"] for event in journey["events"]]
    if not dates or total_weeks < 1:
        return []
    step = max(1, math.ceil(total_weeks / 16))
    ticks = []
    for week in range(1, total_weeks + 1, step):
        start = semester.start_date + timedelta(weeks=week - 1)
        if start > semester.end_date:
            break
        end = min(start + timedelta(weeks=step) - timedelta(days=1), semester.end_date)
        state = "past" if end < today else ("current" if start <= today else "upcoming")
        ticks.append({"label": f"W{week}", "state": state, "at": _now_position(dates, start) / 100})
    return ticks


# ---------------------------------------------------------------- the two calls the views make

def home_snake():
    return build_snake(feature_nodes())


def journey_snake(journey, semester, today, total_weeks):
    return build_snake(
        journey_nodes(journey),
        now=journey["now"] / 100,
        now_label=journey["now_label"],
        ticks=journey_ticks(journey, semester, today, total_weeks),
    )
