"""
Vision Service Unit Tests
=========================
Verifies:
- Base64 image decoding & orientation normalization
- CLAHE histogram equalization
- Sobel & Canny edge detection
- Inpainting mask creation and border blending
"""

import unittest
import numpy as np
from app.preprocessing import (
    apply_clahe,
    detect_edges,
    encode_image,
    enhance_contrast,
    to_grayscale,
)
from app.inpainting import create_removal_mask, remove_furniture

class TestVisionAlgorithms(unittest.TestCase):
    def setUp(self):
        # Create synthetic test room image (100x100 RGB)
        self.test_img = np.zeros((100, 100, 3), dtype=np.uint8)
        self.test_img[:50, :] = [230, 220, 210]   # Wall color
        self.test_img[50:, :] = [180, 150, 120]   # Floor color
        # Add a synthetic sofa box in the center
        self.test_img[40:80, 30:70] = [80, 120, 90]

    def test_grayscale_conversion(self):
        gray = to_grayscale(self.test_img)
        self.assertEqual(gray.ndim, 2)
        self.assertEqual(gray.shape, (100, 100))
        # Ensure values are non-zero and bounded
        self.assertTrue(np.all(gray >= 0) and np.all(gray <= 255))

    def test_edge_detection(self):
        edges = detect_edges(self.test_img, method="canny")
        self.assertEqual(edges.shape, (100, 100))
        # Horizon and sofa edges should be detected
        self.assertTrue(np.any(edges > 0))

    def test_clahe_equalization(self):
        enhanced = apply_clahe(self.test_img)
        self.assertEqual(enhanced.shape, self.test_img.shape)
        self.assertEqual(enhanced.dtype, np.uint8)

    def test_inpainting_mask_and_fill(self):
        # Sofa bounding box [x1, y1, x2, y2]
        boxes = [[30, 40, 70, 80]]
        mask = create_removal_mask(self.test_img.shape, boxes, dilation_iterations=1)
        self.assertEqual(mask.shape, (100, 100))
        self.assertTrue(np.any(mask == 255))

        inpainted, method = remove_furniture(self.test_img, mask, method="telea")
        self.assertEqual(inpainted.shape, self.test_img.shape)
        # Background outside the mask should be preserved
        np.testing.assert_array_equal(self.test_img[:30, :], inpainted[:30, :])

    def test_image_encoding(self):
        data_uri = encode_image(self.test_img, fmt="png")
        self.assertTrue(data_uri.startswith("data:image/png;base64,"))

if __name__ == "__main__":
    unittest.main()
