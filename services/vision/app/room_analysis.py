"""
Room Analysis — Geometry estimation from a single image
========================================================

**Computer Vision / Computer Graphics concepts demonstrated:**

1. **Hough Line Transform** — detecting straight lines in an edge map by
   accumulating votes in (ρ, θ) parameter space.  Every edge pixel votes for
   all lines that could pass through it; peaks in the accumulator correspond
   to dominant lines in the image.

2. **Vanishing-point estimation** — in a perspective projection, parallel
   lines in the 3-D world converge to a *vanishing point* in the image plane.
   An interior room typically has up to three vanishing points (one per
   principal direction).  We cluster line-pair intersection points to find
   them.

3. **RANSAC floor-plane fitting** — given a depth map, we sample random
   3-point subsets, fit a plane ``ax + by + cz + d = 0``, and keep the model
   with the most inliers.  This robustly estimates the dominant horizontal
   surface (floor) even in the presence of furniture clutter.

4. **Perspective geometry** — vanishing points and the floor plane together
   give us a rough understanding of the room's 3-D layout, which can be used
   for furniture placement in augmented-reality overlays.
"""

from __future__ import annotations

import logging
import math
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Hough-based room boundary estimation
# ---------------------------------------------------------------------------

def estimate_room_boundaries(
    image: np.ndarray,
    depth: np.ndarray | None = None,
) -> dict[str, Any]:
    """Estimate dominant room boundaries using Hough Line Transform.

    **Computer Vision concept — Hough Line Transform:**
    Each edge pixel (x, y) in the binary edge map votes for all sinusoidal
    curves ``ρ = x·cos(θ) + y·sin(θ)`` that pass through it.  Bins with
    many votes correspond to strong linear features — walls, floor edges,
    door frames, etc.

    We further classify lines into horizontal, vertical, and diagonal based
    on their angle and combine them into a boundary estimate.

    Parameters
    ----------
    image : np.ndarray
        BGR image.
    depth : np.ndarray | None
        Optional HxW float32 depth map for depth-aware filtering.

    Returns
    -------
    dict
        ``{'lines': list, 'horizontal': list, 'vertical': list,
           'boundary_polygon': list}``
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), sigmaX=1.0)
    edges = cv2.Canny(blurred, 50, 150, apertureSize=3)

    # Probabilistic Hough Transform — returns line segments
    lines_raw = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=80,
        minLineLength=60,
        maxLineGap=15,
    )

    h, w = image.shape[:2]
    horizontal: list[list[int]] = []
    vertical: list[list[int]] = []
    all_lines: list[list[int]] = []

    if lines_raw is not None:
        for line in lines_raw:
            x1, y1, x2, y2 = [int(value) for value in line[0]]
            all_lines.append([x1, y1, x2, y2])

            angle = abs(math.degrees(math.atan2(y2 - y1, x2 - x1)))
            if angle < 15 or angle > 165:
                horizontal.append([x1, y1, x2, y2])
            elif 75 < angle < 105:
                vertical.append([x1, y1, x2, y2])

    # Build a simplified boundary polygon from extreme line endpoints
    boundary_polygon = _compute_boundary_polygon(horizontal, vertical, w, h)

    result: dict[str, Any] = {
        "lines": all_lines,
        "horizontal_count": len(horizontal),
        "vertical_count": len(vertical),
        "total_lines": len(all_lines),
        "boundary_polygon": boundary_polygon,
        "image_size": {"width": w, "height": h},
    }

    # If depth is provided, estimate rough room dimensions
    if depth is not None:
        result["depth_stats"] = {
            "min_depth": float(np.min(depth)),
            "max_depth": float(np.max(depth)),
            "mean_depth": float(np.mean(depth)),
        }

    return result


def _compute_boundary_polygon(
    horizontal: list[list[int]],
    vertical: list[list[int]],
    w: int,
    h: int,
) -> list[list[int]]:
    """Derive a rough room boundary polygon from dominant H/V lines.

    Falls back to the full image rectangle if insufficient lines are found.
    """
    if len(horizontal) < 2 or len(vertical) < 2:
        return [[0, 0], [w, 0], [w, h], [0, h]]

    # Sort horizontal lines by Y and take the first and last as top/bottom
    horizontal.sort(key=lambda l: (l[1] + l[3]) / 2)
    top_y = int((horizontal[0][1] + horizontal[0][3]) / 2)
    bottom_y = int((horizontal[-1][1] + horizontal[-1][3]) / 2)

    # Sort vertical lines by X and take the first and last as left/right
    vertical.sort(key=lambda l: (l[0] + l[2]) / 2)
    left_x = int((vertical[0][0] + vertical[0][2]) / 2)
    right_x = int((vertical[-1][0] + vertical[-1][2]) / 2)

    return [
        [left_x, top_y],
        [right_x, top_y],
        [right_x, bottom_y],
        [left_x, bottom_y],
    ]


# ---------------------------------------------------------------------------
# Vanishing-point detection
# ---------------------------------------------------------------------------

def detect_vanishing_points(
    image: np.ndarray,
    max_points: int = 3,
) -> list[dict[str, float]]:
    """Detect vanishing points via line intersection clustering.

    **Computer Vision concept — Vanishing-point estimation:**
    In a pinhole camera model, any set of 3-D parallel lines projects to
    lines in the image that converge at a single vanishing point.  An indoor
    scene typically has three mutually orthogonal vanishing points:
      – Two horizontal VPs (along left-right walls)
      – One vertical VP (floor-to-ceiling direction)

    We detect lines with Hough, compute pairwise intersections, and cluster
    the intersection points using a simple grid-based binning approach.

    Parameters
    ----------
    image : np.ndarray
        BGR image.
    max_points : int
        Maximum number of vanishing points to return.

    Returns
    -------
    list[dict]
        Each dict has ``'x'``, ``'y'``, ``'strength'`` (vote count).
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)

    lines = cv2.HoughLinesP(
        edges, rho=1, theta=np.pi / 180, threshold=60,
        minLineLength=40, maxLineGap=10,
    )

    if lines is None or len(lines) < 2:
        logger.info("Not enough lines for vanishing-point detection")
        return []

    h, w = image.shape[:2]
    # Compute pairwise intersections
    intersections: list[tuple[float, float]] = []
    segments = [l[0] for l in lines]

    for i in range(len(segments)):
        for j in range(i + 1, min(i + 50, len(segments))):  # limit pairs
            pt = _line_intersection(segments[i], segments[j])
            if pt is not None:
                x, y = pt
                # Allow vanishing points outside the image (but not too far)
                if -w < x < 2 * w and -h < y < 2 * h:
                    intersections.append((x, y))

    if not intersections:
        return []

    # Bin-based clustering
    vanishing_points = _cluster_intersections(intersections, w, h, max_points)
    return vanishing_points


def _line_intersection(
    seg1: list[int], seg2: list[int]
) -> tuple[float, float] | None:
    """Compute the intersection of two 2-D line segments (extended to full lines).

    Uses the cross-product formula for line-line intersection.
    """
    x1, y1, x2, y2 = [float(value) for value in seg1]
    x3, y3, x4, y4 = [float(value) for value in seg2]

    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-8:
        return None  # parallel or coincident

    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    ix = x1 + t * (x2 - x1)
    iy = y1 + t * (y2 - y1)
    return (ix, iy)


def _cluster_intersections(
    pts: list[tuple[float, float]],
    w: int,
    h: int,
    k: int,
) -> list[dict[str, float]]:
    """Simple grid-based clustering of 2-D points, returning top-k cluster centres."""
    bin_size = max(w, h) // 10 or 1
    bins: dict[tuple[int, int], list[tuple[float, float]]] = {}

    for x, y in pts:
        bx = int(x // bin_size)
        by = int(y // bin_size)
        bins.setdefault((bx, by), []).append((x, y))

    # Sort bins by vote count
    sorted_bins = sorted(bins.values(), key=len, reverse=True)

    results: list[dict[str, float]] = []
    for cluster in sorted_bins[:k]:
        xs = [p[0] for p in cluster]
        ys = [p[1] for p in cluster]
        results.append({
            "x": float(np.median(xs)),
            "y": float(np.median(ys)),
            "strength": float(len(cluster)),
        })

    return results


# ---------------------------------------------------------------------------
# Floor-plane estimation (RANSAC)
# ---------------------------------------------------------------------------

def estimate_floor_plane(
    depth: np.ndarray,
    n_iterations: int = 200,
    inlier_threshold: float = 0.02,
) -> dict[str, Any]:
    """Estimate the dominant floor plane from a depth map using RANSAC.

    **Computer Vision concept — RANSAC (Random Sample Consensus):**
    RANSAC is a robust estimator that fits a model to data containing
    outliers.  For plane fitting:
    1. Sample 3 random 3-D points (from the depth map).
    2. Fit a plane through them.
    3. Count how many other points lie within ``inlier_threshold`` of the plane.
    4. Keep the plane with the most inliers after ``n_iterations`` trials.

    We convert each pixel (u, v) with depth ``d`` into a 3-D point using a
    simplified pinhole model (assuming unit focal length for relative depth).

    Parameters
    ----------
    depth : np.ndarray
        HxW float32 normalised depth map in [0, 1].
    n_iterations : int
        Number of RANSAC iterations.
    inlier_threshold : float
        Distance threshold to count a point as an inlier.

    Returns
    -------
    dict
        ``{'normal': [a,b,c], 'd': float, 'inlier_ratio': float}``
    """
    h, w = depth.shape[:2]

    # Build a sparse point cloud — sample every 8th pixel for speed
    step = 8
    us = np.arange(0, w, step, dtype=np.float32)
    vs = np.arange(0, h, step, dtype=np.float32)
    uu, vv = np.meshgrid(us, vs)
    uu = uu.flatten()
    vv = vv.flatten()
    dd = depth[vv.astype(int), uu.astype(int)]

    # Filter out zero-depth
    valid = dd > 0.01
    uu, vv, dd = uu[valid], vv[valid], dd[valid]
    n_pts = len(uu)

    if n_pts < 10:
        return {"normal": [0, 1, 0], "d": 0.0, "inlier_ratio": 0.0}

    # 3-D points (normalised image coords)
    points = np.stack([uu / w, vv / h, dd], axis=1)  # (N, 3)

    best_inliers = 0
    best_plane = np.array([0.0, 1.0, 0.0, 0.0])

    rng = np.random.default_rng(42)

    for _ in range(n_iterations):
        idx = rng.choice(n_pts, 3, replace=False)
        p0, p1, p2 = points[idx]

        # Plane normal via cross product
        v1 = p1 - p0
        v2 = p2 - p0
        normal = np.cross(v1, v2)
        norm_len = np.linalg.norm(normal)
        if norm_len < 1e-8:
            continue
        normal /= norm_len

        d = -np.dot(normal, p0)

        # Count inliers
        dists = np.abs(points @ normal + d)
        inliers = int(np.sum(dists < inlier_threshold))

        if inliers > best_inliers:
            best_inliers = inliers
            best_plane = np.array([*normal, d])

    inlier_ratio = best_inliers / n_pts if n_pts > 0 else 0.0

    return {
        "normal": best_plane[:3].tolist(),
        "d": float(best_plane[3]),
        "inlier_ratio": round(inlier_ratio, 4),
    }
