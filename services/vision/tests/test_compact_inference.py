"""Exercise actual detection postprocessing with fixed network outputs, no weights."""
import unittest
from unittest.mock import Mock, patch

import numpy as np
import torch

from app.inference import detect_furniture
from app.inpainting import composite_result


class CompactInferenceTests(unittest.TestCase):
    def test_compact_output_retains_geometry_without_encoding_images(self):
        image = np.full((80, 100, 3), [20, 80, 160], dtype=np.uint8)
        masks = torch.zeros((1, 1, 80, 100))
        masks[0, 0, 20:60, 30:70] = 1
        model = Mock(return_value=[dict(boxes=torch.tensor([[30., 20., 70., 60.]]),
                    labels=torch.tensor([62]), scores=torch.tensor([.95]), masks=masks)])
        with patch('app.inference._load_model', return_value=model):
            full = detect_furniture(image)[0]
            with patch('app.inference.encode_image', side_effect=AssertionError('Unused PNG encoded')):
                compact = detect_furniture(image, include_artifacts=False)[0]
        artifacts = {'mask_uri', 'raw_mask_uri', 'thumbnail_uri'}
        self.assertEqual(full.model_dump(exclude=artifacts), compact.model_dump(exclude=artifacts))
        for field in artifacts:
            self.assertIsNone(getattr(compact, field))
            self.assertTrue(getattr(full, field).startswith('data:image/png;base64,'))

    def test_binary_composition_copies_only_selected_pixels_without_mutation(self):
        rng = np.random.default_rng(3)
        original = rng.integers(0, 256, (50, 60, 3), dtype=np.uint8)
        generated = rng.integers(0, 256, original.shape, dtype=np.uint8)
        mask = rng.integers(0, 2, original.shape[:2], dtype=np.uint8) * 255
        before = original.copy()
        result = composite_result(original, generated, mask)
        np.testing.assert_array_equal(result[mask == 0], original[mask == 0])
        np.testing.assert_array_equal(result[mask > 0], generated[mask > 0])
        np.testing.assert_array_equal(original, before)
        np.testing.assert_array_equal(composite_result(original, generated, mask[:, :, None]), result)
