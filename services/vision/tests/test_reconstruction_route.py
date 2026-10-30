"""Exercise validated /analyze inputs and raw depth -> geometry without weights.

Direct route calls keep these tests independent of event-loop socket permissions.
Existing test_routes.py covers the HTTP layer in environments that permit it.
"""
import unittest
from unittest.mock import patch

import numpy as np
from pydantic import ValidationError

from app.depth import DepthEstimate
from app.preprocessing import encode_image
from app.routes import analyze_room
from app.schemas import AnalyzeRequest, BoundingBox, Detection
from test_room_reconstruction import pinhole_room


class ReconstructionRouteTests(unittest.TestCase):
    def setUp(self):
        self.image, self.depth, self.camera, _ = pinhole_room()

    def request(self, units="meters", **options):
        result = DepthEstimate(self.depth, units, "mock-depth-test", [])
        with patch("app.routes.detect_furniture", return_value=[]), \
                patch("app.routes.estimate_depth_result", return_value=result) as estimator:
            response = analyze_room(AnalyzeRequest(**{
                "image": encode_image(self.image, fmt="png"),
                "include_room": True, "intrinsics": self.camera, **options,
            }))
        return response.model_dump(mode='json'), estimator

    def test_room_request_uses_raw_metric_depth_even_without_display_artifact(self):
        body, estimator = self.request()
        estimator.assert_called_once()
        self.assertIsNone(body["depth_map"])
        self.assertIsNone(body["depth_raw"])
        self.assertEqual(body["room_proposal"]["status"], "estimated")
        self.assertAlmostEqual(body["room_proposal"]["widthM"], 5.2, delta=.12)
        self.assertTrue(body["room_proposal"]["partial"])
        self.assertEqual(body["room_proposal"]["camera"]["source"], "provided")
        self.assertNotIn("boundary_polygon", body["room_estimate"])
        self.assertEqual(body["model_versions"]["depth"], "mock-depth-test")

    def test_display_depth_and_raw_metric_artifact_can_accompany_geometry(self):
        body, _ = self.request(include_depth=True)
        self.assertTrue(body["depth_map"].startswith("data:image/png;base64,"))
        self.assertTrue(body["depth_raw"].startswith("data:image/png;base64,"))
        self.assertEqual(body["depth_metadata"]["raw_png_unit"], "millimeters")
        self.assertEqual(body["room_proposal"]["status"], "estimated")

    def test_heuristic_depth_never_yields_dimensions_or_fake_corners(self):
        body, _ = self.request("heuristic", include_depth=True)
        self.assertIsNone(body["depth_raw"])
        proposal = body["room_proposal"]
        self.assertEqual(proposal["status"], "insufficient-evidence")
        self.assertEqual(proposal["floorCornersPx"], [])
        self.assertNotIn("widthM", proposal)
        self.assertNotIn("imageToFloor", proposal)

    def test_depth_failure_returns_actionable_no_evidence_result(self):
        with patch("app.routes.detect_furniture", return_value=[]), \
                patch("app.routes.estimate_depth_result", side_effect=RuntimeError("test unavailable")):
            response = analyze_room(AnalyzeRequest(**{
                "image": encode_image(self.image, fmt="png"), "include_room": True,
            }))
        self.assertEqual(response.room_proposal["status"], "insufficient-evidence")
        self.assertEqual(response.room_proposal["floorCornersPx"], [])
        self.assertTrue(any("Depth could not finish" in w for w in response.warnings))

    def test_intrinsics_reject_invalid_focal_lengths(self):
        with self.assertRaises(ValidationError):
            AnalyzeRequest(image=encode_image(self.image, fmt="png"), include_room=True,
                           intrinsics={**self.camera, "fx": 0})

    def test_unsupported_floor_preserves_detections_for_either_hough_layout(self):
        segments = np.array([[20, 20, 300, 20], [20, 20, 20, 220], [20, 20, 300, 220]], dtype=np.int32)
        detection = Detection(label="chair", class_id=62, score=.9,
                              box=BoundingBox(x1=100, y1=80, x2=160, y2=150))
        for shape in [(3, 4), (3, 1, 4)]:
            with self.subTest(shape=shape), \
                    patch("app.routes.detect_furniture", return_value=[detection]), \
                    patch("app.routes.estimate_depth_result", return_value=DepthEstimate(self.depth, "meters", "mock-depth-test", [])), \
                    patch("app.room_reconstruction._fit_floor", return_value=None), \
                    patch("cv2.HoughLinesP", return_value=segments.reshape(shape)):
                response = analyze_room(AnalyzeRequest(image=encode_image(self.image, fmt="png"), include_room=True))
                body = response.model_dump(mode="json")
                self.assertEqual(body["detections"][0]["label"], "chair")
                self.assertEqual(body["room_proposal"]["status"], "insufficient-evidence")
                self.assertEqual(body["room_proposal"]["fitting"]["lineCount"], 3)
                self.assertEqual(body["room_estimate"]["total_lines"], 3)
                self.assertGreater(len(body["room_estimate"]["vanishing_points"]), 0)
                self.assertNotIn("boundary_polygon", body["room_estimate"])
                self.assertNotIn("widthM", body["room_proposal"])

    def test_geometry_exception_does_not_repeat_the_failing_reconstructor(self):
        with patch("app.routes.reconstruct_room", side_effect=RuntimeError("test geometry failure")) as reconstruct:
            body, _ = self.request()
        reconstruct.assert_called_once()
        self.assertEqual(body["room_proposal"]["status"], "insufficient-evidence")
        self.assertEqual(body["room_proposal"]["floorCornersPx"], [])
        self.assertTrue(any("Room fitting could not finish" in w for w in body["warnings"]))
        self.assertNotIn("widthM", body["room_proposal"])

    def test_diagnostic_error_does_not_discard_a_valid_room_draft(self):
        with patch("app.routes.estimate_room_boundaries", side_effect=RuntimeError("test diagnostic failure")):
            body, _ = self.request()
        self.assertEqual(body["room_proposal"]["status"], "estimated")
        self.assertAlmostEqual(body["room_proposal"]["widthM"], 5.2, delta=.12)
        self.assertIsNone(body["room_estimate"])

    def test_furniture_projection_error_keeps_the_room_and_explains_fallback(self):
        with patch("app.routes.populate_room_proposal", side_effect=RuntimeError("test projection failure")):
            body, _ = self.request()
        self.assertEqual(body['room_proposal']['status'], 'estimated')
        self.assertAlmostEqual(body['room_proposal']['widthM'], 5.2, delta=.12)
        self.assertTrue(any('Furniture depth positions' in w for w in body['warnings']))


if __name__ == "__main__":
    unittest.main()
