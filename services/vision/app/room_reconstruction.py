"""Bounded, deterministic room drafts from optical-Z metric depth.

This module never loads models. It consumes the original oriented BGR image and
raw depth in metres; a visualization/relative-depth map is not metric evidence.
Camera coordinates are x right, y down, z forward. Returned XZ coordinates are
metres on a fitted floor, translated into a positive rectangle. The rectangle
describes a *partial visible extent*, not the dimensions of an unseen room.
"""
from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np


_FOV_DEGREES = 60.0
_MAX_SAMPLES = 8000
_RANSAC_TRIALS = 180


def _dot(points: np.ndarray, normal: np.ndarray) -> np.ndarray:
    # Avoid a threaded BLAS invocation for each tiny three-column RANSAC product.
    return np.sum(points * normal, axis=1)


def _camera(width: int, height: int, intrinsics: Any) -> dict[str, Any]:
    if intrinsics is None:
        focal = width / (2.0 * math.tan(math.radians(_FOV_DEGREES / 2)))
        return {"fx": focal, "fy": focal, "cx": (width - 1) / 2,
                "cy": (height - 1) / 2, "source": "fov-assumption"}
    values = intrinsics.model_dump() if hasattr(intrinsics, "model_dump") else intrinsics
    camera = {key: float(values[key]) for key in ("fx", "fy", "cx", "cy")}
    if not all(math.isfinite(value) for value in camera.values()):
        raise ValueError("Camera intrinsics must be finite.")
    if not (width * .05 <= camera["fx"] <= width * 30 and
            height * .05 <= camera["fy"] <= height * 30):
        raise ValueError("Camera focal lengths are implausible for this image.")
    if not (-width * 4 <= camera["cx"] <= width * 5 and
            -height * 4 <= camera["cy"] <= height * 5):
        raise ValueError("Camera principal point is implausible for this image.")
    camera["source"] = "provided"
    return camera


def _exclusion(shape: tuple[int, int], boxes: Any) -> np.ndarray:
    """Exclude furniture boxes [x, y, width, height], including mask fringes.

    Using enclosing boxes is deliberately conservative: furniture pixels, even
    holes in an instance mask, cannot vote for a structural plane.
    """
    mask = np.zeros(shape, dtype=np.uint8)
    if boxes is None:
        return mask.astype(bool)
    height, width = shape
    margin = max(2, round(max(shape) * .004))
    for box in list(boxes)[:100]:
        try:
            x, y, w, h = map(float, box)
            if not all(math.isfinite(v) for v in (x, y, w, h)) or w <= 0 or h <= 0:
                continue
            left, right = max(0, math.floor(x) - margin), min(width, math.ceil(x + w) + margin)
            top, bottom = max(0, math.floor(y) - margin), min(height, math.ceil(y + h) + margin)
            if right > left and bottom > top:
                mask[top:bottom, left:right] = 1
        except (TypeError, ValueError, OverflowError):
            continue
    return mask.astype(bool)


def _line_candidates(image: np.ndarray, excluded: np.ndarray) -> list[list[int]]:
    """Actual bounded Hough segments; never turn the image border into a floor."""
    height, width = image.shape[:2]
    scale = min(1.0, 960 / max(height, width))
    working = cv2.resize(image, (max(1, round(width * scale)), max(1, round(height * scale)))) if scale < 1 else image
    small_mask = cv2.resize(excluded.astype(np.uint8), (working.shape[1], working.shape[0]), interpolation=cv2.INTER_NEAREST)
    gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    edges[cv2.dilate(small_mask, np.ones((5, 5), np.uint8)) > 0] = 0
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=max(16, round(min(working.shape[:2]) * .10)),
                            minLineLength=max(16, round(min(working.shape[:2]) * .14)), maxLineGap=8)
    if lines is None:
        return []
    segments = sorted(lines[:, 0].tolist(), key=lambda p: (p[2] - p[0]) ** 2 + (p[3] - p[1]) ** 2, reverse=True)
    return [[int(round(value / scale)) for value in segment] for segment in segments[:60]]


def _unavailable(image: np.ndarray, excluded: np.ndarray, warning: str,
                 camera: dict[str, Any] | None = None) -> dict[str, Any]:
    candidates = _line_candidates(image, excluded)
    result: dict[str, Any] = {
        "status": "insufficient-evidence", "source": "unavailable",
        "method": "image-lines-only" if candidates else "unavailable",
        "partial": True, "confidence": "low", "floorCornersPx": [],
        "warnings": [warning, "A single photograph does not establish hidden room boundaries. Enter or verify measured dimensions."],
        "fitting": {"lineCandidatesPx": candidates, "lineCount": len(candidates)},
    }
    if camera is not None:
        result["camera"] = camera
    return result


def _refine_plane(points: np.ndarray) -> tuple[np.ndarray, float] | None:
    if len(points) < 3:
        return None
    center = np.mean(points, axis=0)
    _, values, vectors = np.linalg.svd(points - center, full_matrices=False)
    if len(values) < 3 or values[1] < .05:
        return None
    normal = vectors[-1]
    return normal, -float(np.dot(normal, center))


def _fit_floor(points: np.ndarray, pixels: np.ndarray, threshold: float,
               height: int, width: int) -> tuple[np.ndarray, float, np.ndarray] | None:
    rng = np.random.default_rng(741)
    best: np.ndarray | None = None
    best_count = 0
    for _ in range(_RANSAC_TRIALS):
        a, b, c = points[rng.choice(len(points), 3, replace=False)]
        normal = np.cross(b - a, c - a)
        length = np.linalg.norm(normal)
        if length < 1e-7:
            continue
        normal /= length
        if normal[1] < 0:
            normal = -normal
        d = -float(np.dot(normal, a))
        # Upright camera within about 48 degrees of level; camera above floor.
        if normal[1] < .67 or not .25 <= -d <= 3.5:
            continue
        inliers = np.abs(_dot(points, normal) + d) <= threshold
        count = int(inliers.sum())
        if count > best_count:
            best, best_count = inliers, count
    if best is None or best_count < max(70, len(points) * .20):
        return None
    for _ in range(2):
        refined = _refine_plane(points[best])
        if refined is None:
            return None
        normal, d = refined
        if normal[1] < 0:
            normal, d = -normal, -d
        if normal[1] < .67 or not .25 <= -d <= 3.5:
            return None
        best = np.abs(_dot(points, normal) + d) <= threshold
    if int(best.sum()) < max(70, len(points) * .20):
        return None
    support = pixels[best]
    xspan = float(np.ptp(support[:, 0]))
    yspan = float(np.ptp(support[:, 1]))
    if xspan < width * .22 or yspan < height * .12 or np.percentile(support[:, 1], 90) < height * .80:
        return None
    return normal, d, best


def _base_axes(floor_normal: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    xaxis = np.array([1., 0., 0.]) - floor_normal * floor_normal[0]
    xaxis /= np.linalg.norm(xaxis)
    zaxis = np.cross(xaxis, floor_normal)
    return xaxis, zaxis


def _fit_walls(points: np.ndarray, floor_normal: np.ndarray, floor_d: float,
               threshold: float) -> list[dict[str, Any]]:
    """Find up to three vertical planes, with a bounded sample and trial count."""
    xaxis, zaxis = _base_axes(floor_normal)
    above_floor = -(_dot(points, floor_normal) + floor_d)
    remaining = points[(above_floor > max(.13, threshold * 2)) & (above_floor < 3.8)]
    walls: list[dict[str, Any]] = []
    rng = np.random.default_rng(742)
    minimum = max(90, round(len(points) * .035))
    for _ in range(3):
        if len(remaining) < minimum:
            break
        best = None
        best_count = 0
        for _ in range(_RANSAC_TRIALS):
            # A vertical plane is a line in floor coordinates. Two samples
            # suffice, while the floor normal supplies the vertical direction.
            a, b = remaining[rng.choice(len(remaining), 2, replace=False)]
            normal = np.cross(b - a, floor_normal)
            length = np.linalg.norm(normal)
            if length < .10:
                continue
            normal /= length
            d = -float(np.dot(normal, a))
            inliers = np.abs(_dot(remaining, normal) + d) <= threshold
            count = int(inliers.sum())
            if count > best_count:
                best, best_count = inliers, count
        if best is None or best_count < minimum:
            break
        selected = remaining[best]
        # Refine in 2D so the wall remains perpendicular to the fitted floor.
        horizontal = np.column_stack((_dot(selected, xaxis), _dot(selected, zaxis)))
        center = np.mean(horizontal, axis=0)
        _, values, vectors = np.linalg.svd(horizontal - center, full_matrices=False)
        if values[0] < .3:
            break
        normal = vectors[-1, 0] * xaxis + vectors[-1, 1] * zaxis
        d = -float(np.median(_dot(selected, normal)))
        inliers = np.abs(_dot(remaining, normal) + d) <= threshold
        selected = remaining[inliers]
        if len(selected) < minimum:
            break
        tangent = np.cross(floor_normal, normal)
        horizontal_span = float(np.diff(np.percentile(_dot(selected, tangent), [5, 95]))[0])
        vertical_span = float(np.diff(np.percentile(_dot(selected, floor_normal), [5, 95]))[0])
        remaining = remaining[~inliers]
        if horizontal_span < .55 or vertical_span < .45:
            continue
        walls.append({"normal": normal, "d": d, "count": len(selected),
                      "center": np.median(selected, axis=0),
                      "horizontalSpanM": horizontal_span, "verticalSpanM": vertical_span})
    return walls


def _aligned_axes(floor_normal: np.ndarray, walls: list[dict[str, Any]]) -> tuple[np.ndarray, np.ndarray]:
    xaxis, zaxis = _base_axes(floor_normal)
    if not walls:
        return xaxis, zaxis
    dominant = max(walls, key=lambda wall: wall["count"])["normal"]
    if abs(np.dot(dominant, xaxis)) > abs(np.dot(dominant, zaxis)):
        xaxis = dominant * (1 if np.dot(dominant, xaxis) >= 0 else -1)
        zaxis = np.cross(xaxis, floor_normal)
    else:
        zaxis = dominant * (1 if np.dot(dominant, zaxis) >= 0 else -1)
        xaxis = np.cross(floor_normal, zaxis)
    return xaxis, zaxis


def _limits(floor_xz: np.ndarray, origin: np.ndarray, xaxis: np.ndarray,
            zaxis: np.ndarray, walls: list[dict[str, Any]]) -> tuple[np.ndarray, list[str]]:
    limits = np.percentile(floor_xz, [1, 99], axis=0)
    observed = [[False, False], [False, False]]  # [low/high][X/Z]
    for wall in walls:
        components = np.array([np.dot(wall["normal"], xaxis), np.dot(wall["normal"], zaxis)])
        axis = int(np.argmax(np.abs(components)))
        if abs(components[axis]) < math.cos(math.radians(12)):
            continue
        # Snap a supported wall to its Manhattan axis at its observed centre.
        # Dividing the unsnapped plane offset would extrapolate a small normal
        # error all the way to the camera and bias short/noisy side-wall fits.
        coordinate = float(np.dot(wall["center"] - origin, xaxis if axis == 0 else zaxis))
        side = int(coordinate > np.mean(limits[:, axis]))
        span = float(limits[1, axis] - limits[0, axis])
        tolerance = max(.30, span * .18)
        # Only walls that bound the actual floor support can replace a view
        # limit. A distant wall behind an occluder cannot expand the shell.
        if abs(coordinate - limits[side, axis]) > tolerance:
            continue
        inside = floor_xz[:, axis] >= coordinate - .12 if side == 0 else floor_xz[:, axis] <= coordinate + .12
        if float(inside.mean()) < .96:
            continue
        if observed[side][axis] and abs(coordinate - limits[side, axis]) > .15:
            continue
        limits[side, axis] = coordinate
        observed[side][axis] = True
    # Polygon order (0,0), (W,0), (W,D), (0,D): near, right, far, left.
    edges = [observed[0][1], observed[1][0], observed[1][1], observed[0][0]]
    return limits, ["observed-wall" if value else "view-limit" for value in edges]


def reconstruct_room(image: np.ndarray, depth: np.ndarray | None = None,
                     depth_units: str | None = None, boxes: Any = None,
                     intrinsics: Any = None) -> dict[str, Any]:
    """Return a correctable partial floor shell or an honest unavailable result.

    ``depth`` must have source-image HxW shape and contain optical-axis Z in
    metres. ``boxes`` are source pixel [x, y, width, height] furniture boxes.
    ``intrinsics`` optionally supplies fx, fy, cx, cy for the oriented image.
    No normalized, heuristic, radial-range, or display depth is accepted.
    """
    if not isinstance(image, np.ndarray) or image.ndim != 3 or image.shape[2] != 3 or min(image.shape[:2]) < 16:
        raise ValueError("Room reconstruction needs a BGR image at least 16 pixels wide and high.")
    height, width = image.shape[:2]
    excluded = _exclusion((height, width), boxes)
    try:
        camera = _camera(width, height, intrinsics)
    except (KeyError, TypeError, ValueError, OverflowError) as exc:
        return _unavailable(image, excluded, f"Room calibration is invalid: {exc}")
    if depth is None or depth_units != "meters":
        return _unavailable(image, excluded, "Raw learned metric depth in metres is required; relative, normalized, or heuristic depth cannot supply room dimensions.", camera)
    values = np.asarray(depth)
    if values.shape != (height, width) or values.dtype.kind not in "fiu":
        return _unavailable(image, excluded, "Depth must match the oriented source image pixel coordinates.", camera)
    step = max(1, math.ceil(math.sqrt(height * width / _MAX_SAMPLES)))
    vv, uu = np.mgrid[step // 2:height:step, step // 2:width:step]
    sampled = values[vv, uu].astype(np.float64)
    valid = np.isfinite(sampled) & (sampled >= .15) & (sampled <= 30) & ~excluded[vv, uu]
    if int(valid.sum()) < 180:
        return _unavailable(image, excluded, "Too few unobstructed valid metric-depth samples are available for a floor plane.", camera)
    z = sampled[valid]
    if float(np.diff(np.percentile(z, [5, 95]))[0]) < .08:
        return _unavailable(image, excluded, "Depth is nearly constant; it does not establish a plausible floor plane.", camera)
    pixels = np.column_stack((uu[valid], vv[valid])).astype(np.float64)
    points = np.column_stack(((pixels[:, 0] - camera["cx"]) * z / camera["fx"],
                              (pixels[:, 1] - camera["cy"]) * z / camera["fy"], z))
    lower = pixels[:, 1] >= height * .52
    if int(lower.sum()) < 100:
        return _unavailable(image, excluded, "The lower image has too little unobstructed depth to establish a floor.", camera)
    threshold = min(.085, .028 + .006 * float(np.median(z)))
    fitted = _fit_floor(points[lower], pixels[lower], threshold, height, width)
    if fitted is None:
        return _unavailable(image, excluded, "No sufficiently supported plausible floor plane was found in metric depth. Review the photo or enter measured dimensions.", camera)
    normal, d, lower_inliers = fitted
    floor_distance = np.abs(_dot(points, normal) + d)
    # Nearly grazing rays amplify depth errors and cannot set a reliable extent.
    rays = points / points[:, 2, None]
    grazing = _dot(rays, normal) > .12
    inliers = (floor_distance <= threshold) & grazing
    if int(inliers.sum()) < 90:
        return _unavailable(image, excluded, "The floor is only supported near the horizon, where its extent is unstable.", camera)
    floor_points = points[inliers]
    walls = _fit_walls(points, normal, d, threshold * 1.3)
    xaxis, zaxis = _aligned_axes(normal, walls)
    origin = -d * normal
    floor_xz = np.column_stack((_dot(floor_points - origin, xaxis), _dot(floor_points - origin, zaxis)))
    limits, edges = _limits(floor_xz, origin, xaxis, zaxis, walls)
    width_m, depth_m = (limits[1] - limits[0]).tolist()
    if not (.40 <= width_m <= 30 and .40 <= depth_m <= 30):
        return _unavailable(image, excluded, "The supported floor extent is degenerate or implausible; no room dimensions were emitted.", camera)
    local_origin = origin + xaxis * limits[0, 0] + zaxis * limits[0, 1]
    calibration = np.array([[camera["fx"], 0, camera["cx"]],
                            [0, camera["fy"], camera["cy"]], [0, 0, 1.]])
    world_to_image = calibration @ np.column_stack((xaxis, zaxis, local_origin))
    try:
        image_to_floor = np.linalg.inv(world_to_image)
        image_to_floor /= np.linalg.norm(image_to_floor)
        if not np.isfinite(image_to_floor).all() or np.linalg.cond(world_to_image) > 1e9:
            raise np.linalg.LinAlgError("unstable floor projection")
    except np.linalg.LinAlgError:
        return _unavailable(image, excluded, "The floor projection is degenerate; no image-to-floor mapping was emitted.", camera)
    polygon = [[0., 0.], [width_m, 0.], [width_m, depth_m], [0., depth_m]]
    corners: list[list[float]] = []
    projected = (world_to_image @ np.column_stack((polygon, np.ones(4))).T).T
    if np.all(projected[:, 2] > .1):
        quad = projected[:, :2] / projected[:, 2, None]
        inside_image = ((quad[:, 0] >= 0) & (quad[:, 0] <= width - 1) &
                        (quad[:, 1] >= 0) & (quad[:, 1] <= height - 1)).all()
        support_pixels = pixels[inliers]
        nearby = all(float(np.min(np.linalg.norm(support_pixels - corner, axis=1))) <= max(step * 2.5, min(height, width) * .025) for corner in quad)
        if inside_image and nearby and abs(cv2.contourArea(quad.astype(np.float32))) >= height * width * .005:
            corners = quad.tolist()
    warnings = [
        "This is an approximate partial visible-floor shell from learned metric depth. Verify its scale and boundaries with measurements.",
        "Opposite and hidden walls are not established by one photograph. View-limit edges are crop or visibility limits, not observed walls.",
        "A rectangular Manhattan-room prior aligns the draft to the dominant observed wall; irregular rooms need manual correction." if walls else
        "No vertical wall plane was supported. The draft axes follow the camera and all extents need review.",
    ]
    if camera["source"] == "fov-assumption":
        warnings.append("Camera calibration was unavailable: a 60 degree horizontal field of view and square pixels were assumed. Width, depth, and angles may be inaccurate.")
    if not corners:
        warnings.append("The rectangular extent has no complete observed image quadrilateral. Image corners were omitted; the metric projection is valid only on the observed floor.")
    ratio = float(lower_inliers.mean())
    median_residual = float(np.median(floor_distance[inliers]))
    return {
        "status": "estimated", "source": "model-estimated",
        "method": "metric-depth-ransac-manhattan-visible-floor", "partial": True,
        "confidence": "medium" if camera["source"] == "provided" and ratio >= .55 and walls and median_residual < threshold * .5 else "low",
        "floorCornersPx": corners, "floorPolygonXZ": polygon,
        "widthM": width_m, "depthM": depth_m,
        "imageToFloor": image_to_floor.reshape(-1).tolist(),
        "camera": camera, "boundaryEdges": edges, "warnings": warnings,
        "fitting": {
            "depthConvention": "optical-z-meters", "sampleCount": len(points),
            "floorSampleCount": int(inliers.sum()), "lowerFloorInlierRatio": ratio,
            "floorNormalCamera": normal.tolist(), "floorOffsetM": d,
            "cameraHeightM": -d, "medianFloorResidualM": median_residual,
            "planeThresholdM": threshold, "wallCount": len(walls),
            "wallPlanes": [{"normalCamera": wall["normal"].tolist(), "offsetM": wall["d"],
                            "sampleCount": wall["count"]} for wall in walls],
            "floorOriginCamera": local_origin.tolist(), "floorXAxisCamera": xaxis.tolist(),
            "floorZAxisCamera": zaxis.tolist(),
        },
    }
