"""Analytic pinhole scenes exercise geometry without loading model weights."""
import json
import math
import unittest

import cv2
import numpy as np

from app.room_reconstruction import reconstruct_room


def pinhole_room(width=320, height=240, with_walls=True, pitch_degrees=20):
    """Render optical Z for floor y=1.5, walls x=+/-2.6 and z=6 metres.

    World coordinates have y down. Camera is at (0,0,0), tilted down by pitch.
    Exact ray/plane intersections supply independent synthetic ground truth.
    """
    camera = {"fx": width * .875, "fy": width * .875,
              "cx": (width - 1) / 2, "cy": (height - 1) / 2}
    vv, uu = np.mgrid[:height, :width]
    rays = np.stack(((uu - camera["cx"]) / camera["fx"],
                     (vv - camera["cy"]) / camera["fy"], np.ones_like(uu)), axis=-1)
    angle = math.radians(pitch_degrees)
    down = np.array([0., math.cos(angle), math.sin(angle)])
    forward = np.array([0., -math.sin(angle), math.cos(angle)])
    planes = [(down, -1.5, (150, 170, 190))]
    if with_walls:
        planes.extend([(forward, -6., (210, 220, 230)),
                       (np.array([1., 0., 0.]), -2.6, (190, 205, 220)),
                       (np.array([1., 0., 0.]), 2.6, (220, 205, 190))])
    depth = np.full((height, width), np.inf)
    labels = np.full((height, width), -1, dtype=int)
    image = np.zeros((height, width, 3), dtype=np.uint8)
    for label, (normal, offset, color) in enumerate(planes):
        denom = np.sum(rays * normal, axis=-1)
        z = np.divide(-offset, denom, out=np.full_like(denom, np.inf), where=np.abs(denom) > 1e-8)
        finite = np.isfinite(z) & (z > .15) & (z <= 30)
        points = rays * np.where(finite, z, 0)[..., None]
        floor_y = np.sum(points * down, axis=-1)
        world_z = np.sum(points * forward, axis=-1)
        if label:
            finite &= (floor_y <= 1.5 + 1e-6) & (floor_y >= -1.2) & (world_z > .1)
        if with_walls:
            finite &= (np.abs(points[..., 0]) <= 2.6 + 1e-6) & (world_z <= 6 + 1e-6)
        nearer = finite & (z < depth)
        depth[nearer] = z[nearer]
        labels[nearer] = label
        image[nearer] = color
    depth[~np.isfinite(depth)] = 0
    return image, depth.astype(np.float32), camera, labels


class RoomReconstructionTests(unittest.TestCase):
    def test_analytic_floor_and_walls_have_honest_partial_metric_shell(self):
        image, depth, camera, _ = pinhole_room()
        result = reconstruct_room(image, depth, "meters", intrinsics=camera)
        self.assertEqual(result["status"], "estimated", result)
        self.assertEqual(result["source"], "model-estimated")
        self.assertTrue(result["partial"])
        self.assertAlmostEqual(result["widthM"], 5.2, delta=.12)
        self.assertGreater(result["depthM"], 3.9)
        self.assertLess(result["depthM"], 4.6)
        self.assertGreaterEqual(result["boundaryEdges"].count("observed-wall"), 1)
        self.assertIn("view-limit", result["boundaryEdges"])
        self.assertNotIn("heightM", result)
        self.assertNotIn("openings", result)
        self.assertAlmostEqual(result["fitting"]["cameraHeightM"], 1.5, delta=.03)
        np.testing.assert_allclose(result["floorPolygonXZ"], [[0, 0], [result["widthM"], 0],
                                  [result["widthM"], result["depthM"]], [0, result["depthM"]]])
        json.dumps(result, allow_nan=False)

    def test_homography_maps_source_pixels_to_metric_floor_coordinates(self):
        image, depth, camera, labels = pinhole_room()
        result = reconstruct_room(image, depth, "meters", intrinsics=camera)
        homography = np.array(result["imageToFloor"]).reshape(3, 3)
        fit = result["fitting"]
        origin, xaxis, zaxis = (np.array(fit[key]) for key in
                                ["floorOriginCamera", "floorXAxisCamera", "floorZAxisCamera"])
        for u, v in [(110, 180), (200, 200), (160, 150)]:
            self.assertEqual(labels[v, u], 0)
            projected = homography @ np.array([u, v, 1.])
            x, z = projected[:2] / projected[2]
            camera_point = origin + x * xaxis + z * zaxis
            expected = depth[v, u] * np.array([(u - camera["cx"]) / camera["fx"],
                                                (v - camera["cy"]) / camera["fy"], 1.])
            np.testing.assert_allclose(camera_point, expected, atol=.004)
        # Emitted image corners, when present, must map to exactly the shell
        # vertices. Missing corners must remain empty rather than be invented.
        self.assertIn(len(result["floorCornersPx"]), (0, 4))
        for source, expected in zip(result["floorCornersPx"], result["floorPolygonXZ"]):
            mapped = homography @ np.array([*source, 1.])
            np.testing.assert_allclose(mapped[:2] / mapped[2], expected, atol=1e-5)

    def test_noise_outliers_and_furniture_occlusion_remain_bounded(self):
        image, depth, camera, _ = pinhole_room()
        rng = np.random.default_rng(12)
        noisy = depth.copy()
        valid = noisy > 0
        noisy[valid] += rng.normal(0, .012, size=int(valid.sum()))
        outliers = (rng.random(depth.shape) < .13) & valid
        noisy[outliers] = rng.uniform(.3, 12, size=int(outliers.sum()))
        noisy[115:215, 105:210] = .6  # Furniture must never vote as structure.
        image[115:215, 105:210] = (30, 90, 70)
        result = reconstruct_room(image, noisy, "meters", boxes=[[105, 115, 105, 100]], intrinsics=camera)
        self.assertEqual(result["status"], "estimated", result)
        self.assertAlmostEqual(result["widthM"], 5.2, delta=.25)
        self.assertAlmostEqual(result["fitting"]["cameraHeightM"], 1.5, delta=.08)
        for key in ("widthM", "depthM"):
            self.assertTrue(math.isfinite(result[key]))
            self.assertGreater(result[key], .4)
            self.assertLess(result[key], 10)
        self.assertTrue(result["partial"])

    def test_focal_scaling_changes_lateral_extent_in_metres(self):
        image, depth, camera, _ = pinhole_room(with_walls=False)
        first = reconstruct_room(image, depth, "meters", intrinsics=camera)
        second = reconstruct_room(image, depth, "meters", intrinsics={**camera, "fx": camera["fx"] * 2})
        self.assertEqual(first["status"], "estimated", first)
        self.assertEqual(second["status"], "estimated", second)
        self.assertAlmostEqual(second["widthM"] / first["widthM"], .5, delta=.015)
        self.assertAlmostEqual(second["depthM"], first["depthM"], delta=.02)
        self.assertEqual(first["boundaryEdges"], ["view-limit"] * 4)

    def test_metric_scale_is_preserved_instead_of_normalized(self):
        image, depth, camera, _ = pinhole_room()
        first = reconstruct_room(image, depth, "meters", intrinsics=camera)
        second = reconstruct_room(image, depth * 1.4, "meters", intrinsics=camera)
        self.assertEqual(second["status"], "estimated", second)
        self.assertAlmostEqual(second["widthM"] / first["widthM"], 1.4, delta=.03)
        self.assertAlmostEqual(second["depthM"] / first["depthM"], 1.4, delta=.03)

    def test_fov_assumption_is_explicit_and_confidence_low(self):
        image, depth, _, _ = pinhole_room()
        result = reconstruct_room(image, depth, "meters")
        self.assertEqual(result["status"], "estimated", result)
        self.assertEqual(result["camera"]["source"], "fov-assumption")
        self.assertEqual(result["confidence"], "low")
        self.assertTrue(any("60 degree" in warning for warning in result["warnings"]))

    def test_blank_image_without_metric_depth_has_no_floor_or_lines(self):
        result = reconstruct_room(np.zeros((120, 160, 3), dtype=np.uint8))
        self.assertEqual(result["status"], "insufficient-evidence")
        self.assertEqual(result["source"], "unavailable")
        self.assertEqual(result["floorCornersPx"], [])
        self.assertEqual(result["fitting"]["lineCandidatesPx"], [])
        self.assertNotIn("floorPolygonXZ", result)
        self.assertNotIn("imageToFloor", result)
        self.assertNotIn("widthM", result)

    def test_line_only_fallback_reports_real_segments_without_inventing_corners(self):
        image = np.zeros((240, 320, 3), dtype=np.uint8)
        cv2.line(image, (20, 170), (280, 90), (255, 255, 255), 3)
        result = reconstruct_room(image)
        self.assertEqual(result["status"], "insufficient-evidence")
        self.assertEqual(result["method"], "image-lines-only")
        self.assertGreater(len(result["fitting"]["lineCandidatesPx"]), 0)
        self.assertEqual(result["floorCornersPx"], [])
        self.assertNotIn("widthM", result)

    def test_rejects_heuristic_wrong_units_flat_empty_and_misaligned_depth(self):
        image, depth, camera, _ = pinhole_room()
        cases = [(depth, "heuristic"), (depth, "relative"), (depth, "millimeters"),
                 (np.ones(depth.shape) * 4, "meters"), (np.zeros(depth.shape), "meters"),
                 (np.full(depth.shape, np.nan), "meters"), (depth[::2, ::2], "meters")]
        for values, units in cases:
            with self.subTest(units=units, shape=values.shape):
                result = reconstruct_room(image, values, units, intrinsics=camera)
                self.assertEqual(result["status"], "insufficient-evidence", result)
                self.assertEqual(result["floorCornersPx"], [])
                self.assertNotIn("widthM", result)
                json.dumps(result, allow_nan=False)

    def test_fully_excluded_or_invalid_camera_does_not_generate_geometry(self):
        image, depth, camera, _ = pinhole_room()
        for options in [{"boxes": [[0, 0, 320, 240]], "intrinsics": camera},
                        {"intrinsics": {**camera, "fx": 0}},
                        {"intrinsics": {**camera, "cy": float("nan")}}]:
            with self.subTest(options=options):
                result = reconstruct_room(image, depth, "meters", **options)
                self.assertEqual(result["status"], "insufficient-evidence")
                self.assertEqual(result["floorCornersPx"], [])
                self.assertNotIn("imageToFloor", result)

    def test_floor_fit_is_deterministic(self):
        image, depth, camera, _ = pinhole_room(width=160, height=120)
        first = reconstruct_room(image, depth, "meters", intrinsics=camera)
        second = reconstruct_room(image, depth, "meters", intrinsics=camera)
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
