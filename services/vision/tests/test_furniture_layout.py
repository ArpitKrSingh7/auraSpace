"""Independent analytic depth/geometry and mask filtering; no model weights."""
import copy
import json
import unittest

import cv2
import numpy as np

from app.furniture_layout import populate_room_proposal
from app.inference import duplicate_mask
from app.room_reconstruction import reconstruct_room
from app.schemas import BoundingBox, Detection
from test_room_reconstruction import pinhole_room


class FurnitureLayoutTests(unittest.TestCase):
    def setUp(self):
        image, self.depth, self.camera, _ = pinhole_room()
        self.proposal = reconstruct_room(image, self.depth, 'meters', intrinsics=self.camera)
        self.detection = Detection(label='bed', class_id=65, score=.9,
            box=BoundingBox(x1=100, y1=150, x2=210, y2=210),
            mask_polygon=[[100, 150], [210, 150], [210, 210], [100, 210]])
        # Analytic floor rays scaled by .7 produce a parallel elevated surface.
        self.depth[150:211, 100:211] *= .7

    def test_furniture_is_projected_from_its_surface_depth_to_floor_axes(self):
        before = copy.deepcopy(self.proposal)
        result = populate_room_proposal(self.proposal, [self.detection], self.depth)
        self.assertEqual(self.proposal, before)
        self.assertEqual(len(result['furniture']), 1)
        item = result['furniture'][0]
        self.assertEqual(item['detectionIndex'], 0)
        self.assertEqual(item['method'], 'depth-projected')
        self.assertAlmostEqual(item['heightM'], .45, delta=.02)
        self.assertGreater(item['widthM'], .15)
        self.assertGreater(item['depthM'], .15)
        self.assertGreaterEqual(item['centerXZ'][0], 0)
        self.assertLessEqual(item['centerXZ'][0], result['widthM'])
        self.assertLessEqual(item['centerXZ'][1], result['depthM'])
        json.dumps(result, allow_nan=False)

    def test_projected_furniture_extends_a_visible_floor_crop_without_inventing_walls(self):
        proposal = {**self.proposal, 'widthM': .5, 'depthM': .5,
                    'floorPolygonXZ': [[0, 0], [.5, 0], [.5, .5], [0, .5]],
                    'boundaryEdges': ['observed-wall'] * 4}
        result = populate_room_proposal(proposal, [self.detection], self.depth)
        self.assertGreater(max(result['widthM'], result['depthM']), .5)
        self.assertEqual(result['floorCornersPx'], [])
        self.assertIn('view-limit', result['boundaryEdges'])
        self.assertTrue(any('footprints' in warning for warning in result['warnings']))
        self.assertEqual(len(result['imageToFloor']), 9)

    def test_missing_depth_or_mask_does_not_invent_a_furniture_pose(self):
        self.assertIs(populate_room_proposal(self.proposal, [self.detection], None), self.proposal)
        self.detection.mask_polygon = []
        self.assertNotIn('furniture', populate_room_proposal(self.proposal, [self.detection], self.depth))
        unavailable = {'status': 'insufficient-evidence'}
        self.assertIs(populate_room_proposal(unavailable, [self.detection], self.depth), unavailable)

    def test_conflicting_table_mask_over_bed_is_removed_but_adjacent_desk_survives(self):
        bed = np.zeros((100, 100), dtype=np.uint8)
        bed[10:80, 5:45] = 255
        accepted = [(cv2.resize(bed, (128, 128), interpolation=cv2.INTER_NEAREST) > 0, 'bed', .95)]
        self.assertTrue(duplicate_mask(bed, 'dining table', .59, accepted))
        part = np.zeros_like(bed); part[30:60, 10:40] = 255
        self.assertTrue(duplicate_mask(part, 'dining table', .29, accepted))
        desk = np.zeros_like(bed); desk[20:70, 60:95] = 255
        self.assertFalse(duplicate_mask(desk, 'dining table', .25, accepted))
        self.assertFalse(duplicate_mask(desk, 'bed', .85, accepted))


if __name__ == '__main__':
    unittest.main()
