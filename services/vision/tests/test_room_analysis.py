"""Classical room diagnostics across OpenCV Hough output layouts; no models."""
import json
import unittest
from unittest.mock import patch

import numpy as np

from app.room_analysis import detect_vanishing_points, estimate_room_boundaries


class RoomAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.image = np.zeros((240, 320, 3), dtype=np.uint8)
        self.segments = np.array([
            [20, 20, 300, 20],
            [20, 20, 20, 220],
            [20, 20, 300, 220],
        ], dtype=np.int32)

    def test_boundary_diagnostics_accept_flat_and_nested_segments(self):
        for shape in [(3, 4), (3, 1, 4)]:
            with self.subTest(shape=shape), patch("cv2.HoughLinesP", return_value=self.segments.reshape(shape)):
                result = estimate_room_boundaries(self.image)
                self.assertEqual(result["lines"], self.segments.tolist())
                self.assertEqual(result["total_lines"], 3)
                self.assertEqual(result["horizontal_count"], 1)
                self.assertEqual(result["vertical_count"], 1)
                json.dumps(result, allow_nan=False)

    def test_vanishing_points_are_independent_of_hough_array_layout(self):
        for shape in [(3, 4), (3, 1, 4)]:
            with self.subTest(shape=shape), patch("cv2.HoughLinesP", return_value=self.segments.reshape(shape)):
                result = detect_vanishing_points(self.image)
                self.assertEqual(result, [{"x": 20.0, "y": 20.0, "strength": 3.0}])
                json.dumps(result, allow_nan=False)

    def test_no_segments_returns_empty_diagnostics(self):
        for lines in [None, np.empty((0, 4), dtype=np.int32), np.empty((0, 1, 4), dtype=np.int32)]:
            with self.subTest(shape=None if lines is None else lines.shape), patch("cv2.HoughLinesP", return_value=lines):
                self.assertEqual(estimate_room_boundaries(self.image)["total_lines"], 0)
                self.assertEqual(detect_vanishing_points(self.image), [])

    def test_one_segment_does_not_claim_a_vanishing_point(self):
        for shape in [(1, 4), (1, 1, 4)]:
            with self.subTest(shape=shape), patch("cv2.HoughLinesP", return_value=self.segments[:1].reshape(shape)):
                self.assertEqual(estimate_room_boundaries(self.image)["total_lines"], 1)
                self.assertEqual(detect_vanishing_points(self.image), [])


if __name__ == "__main__":
    unittest.main()
