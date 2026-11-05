"""Project observed furniture depth onto the fitted floor; no model loading."""
from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np


def populate_room_proposal(proposal: dict[str, Any], detections, depth: np.ndarray | None) -> dict[str, Any]:
    """Add approximate object poses and include their footprint in the draft.

    Mask pixels live on furniture surfaces, not on the floor. Backproject their
    depth before projecting vertically onto floor axes; applying a floor
    homography directly to a bed's image centre puts it behind the bed.
    """
    if proposal.get("status") != "estimated" or depth is None or not detections:
        return proposal
    fit, camera = proposal.get("fitting", {}), proposal.get("camera", {})
    required = ["floorOriginCamera", "floorXAxisCamera", "floorZAxisCamera", "floorNormalCamera", "floorOffsetM"]
    if not all(key in fit for key in required):
        return proposal
    origin = np.asarray(fit["floorOriginCamera"])
    axis_x, axis_z, normal = (np.asarray(fit[key]) for key in required[1:4])
    height, width = depth.shape
    furniture = []
    for index, detection in enumerate(detections):
        polygon = np.asarray(detection.mask_polygon, dtype=np.float64)
        if polygon.ndim != 2 or polygon.shape[0] < 3 or polygon.shape[1] != 2:
            continue
        mask = np.zeros((height, width), dtype=np.uint8)
        cv2.fillPoly(mask, [np.round(polygon).astype(np.int32)], 1)
        step = max(2, math.ceil(math.sqrt(max(int(mask.sum()), 1) / 2000)))
        v, u = np.where(mask[::step, ::step] > 0)
        v, u = v * step, u * step
        z = depth[v, u]
        points = np.column_stack(((u - camera["cx"]) * z / camera["fx"],
                                  (v - camera["cy"]) * z / camera["fy"], z))
        above = -(points @ normal + fit["floorOffsetM"])
        valid = np.isfinite(points).all(axis=1) & (z > .15) & (z < 30) & (above > .06) & (above < 3)
        if int(valid.sum()) < 20:
            continue
        plane = np.column_stack(((points[valid] - origin) @ axis_x, (points[valid] - origin) @ axis_z))
        median = np.median(plane, axis=0)
        _, _, axes = np.linalg.svd(plane - median, full_matrices=False)
        coordinates = (plane - median) @ axes.T
        limits = np.percentile(coordinates, [3, 97], axis=0)
        extent = limits[1] - limits[0]
        if not np.isfinite(extent).all() or not (.12 < extent.min() and extent.max() < 8):
            continue
        center = median + ((limits[0] + limits[1]) / 2) @ axes
        # The longest bed axis is its depth; tables/sofas use it as width.
        if detection.label == "bed":
            object_width, object_depth = float(extent[1]), float(extent[0])
            yaw = math.atan2(-axes[0, 0], axes[0, 1])
        else:
            object_width, object_depth = float(extent[0]), float(extent[1])
            yaw = math.atan2(axes[0, 1], axes[0, 0])
        furniture.append({
            "detectionIndex": index, "centerXZ": center.tolist(),
            "widthM": object_width, "depthM": object_depth,
            "heightM": float(np.clip(np.percentile(above[valid], 95), .1, 3)),
            "rotationDeg": float(math.degrees(yaw) % 360), "method": "depth-projected",
        })
    if not furniture:
        return proposal

    lower = np.array([0., 0.])
    upper = np.array([proposal["widthM"], proposal["depthM"]])
    for item in furniture:
        angle = math.radians(item["rotationDeg"])
        half = np.array([abs(math.cos(angle)) * item["widthM"] + abs(math.sin(angle)) * item["depthM"],
                         abs(math.sin(angle)) * item["widthM"] + abs(math.cos(angle)) * item["depthM"]]) / 2
        lower = np.minimum(lower, np.asarray(item["centerXZ"]) - half - .06)
        upper = np.maximum(upper, np.asarray(item["centerXZ"]) + half + .06)
    size = upper - lower
    if not np.isfinite(size).all() or size.max() > 30:
        return proposal
    expanded = bool(np.any(lower < -.001) or np.any(upper > [proposal["widthM"] + .001, proposal["depthM"] + .001]))
    result = {**proposal, "furniture": [{**item, "centerXZ": (np.asarray(item["centerXZ"]) - lower).tolist()} for item in furniture]}
    if expanded:
        homography = np.asarray(proposal["imageToFloor"], dtype=np.float64).reshape(3, 3).copy()
        homography[0] -= lower[0] * homography[2]
        homography[1] -= lower[1] * homography[2]
        width_m, depth_m = size.tolist()
        old_edges = proposal.get("boundaryEdges", ["view-limit"] * 4)
        moved = [lower[1] < -.001, upper[0] > proposal["widthM"] + .001,
                 upper[1] > proposal["depthM"] + .001, lower[0] < -.001]
        result.update({
            "widthM": width_m, "depthM": depth_m,
            "floorPolygonXZ": [[0., 0.], [width_m, 0.], [width_m, depth_m], [0., depth_m]],
            "floorCornersPx": [], "imageToFloor": homography.reshape(-1).tolist(),
            "boundaryEdges": ["view-limit" if moved[i] else edge for i, edge in enumerate(old_edges)],
            "fitting": {**fit, "floorOriginCamera": (origin + axis_x * lower[0] + axis_z * lower[1]).tolist()},
            "warnings": [*proposal["warnings"], "The draft includes projected furniture footprints beyond the visible floor. Confirm room width and length; these are not measured walls."],
        })
    return result
