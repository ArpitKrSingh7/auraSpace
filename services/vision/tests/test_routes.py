"""HTTP contracts with synthetic pixels and mocked inference; no weights needed."""
import unittest
from unittest.mock import patch
import numpy as np
from fastapi.testclient import TestClient
from app.main import app
from app.preprocessing import encode_image
from app.schemas import Detection, BoundingBox


class TestRoutes(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.image = encode_image(np.full((80, 100, 3), 160, dtype=np.uint8), fmt='png')

    def test_classical_processing_operations(self):
        for operation in ['grayscale', 'contrast', 'edges', 'clahe', 'contours', 'histogram']:
            with self.subTest(operation=operation):
                response = self.client.post('/process', json={'image': self.image, 'operation': operation})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertTrue(response.json()['uri'].startswith('data:image/'))

    def test_inpainting_and_invalid_boxes(self):
        response = self.client.post('/inpaint', json={'image': self.image, 'boxes': [[30, 20, 15, 20]]})
        self.assertEqual(response.status_code, 200, response.text)
        for box in [[0, 0, -1, 20], [1, 2, 3], [0, 0, 0, 1]]:
            self.assertEqual(self.client.post('/inpaint', json={'image': self.image, 'boxes': [box]}).status_code, 422)

    def test_analysis_contract_without_downloading_models(self):
        detection = Detection(label='chair', class_id=62, score=.9, box=BoundingBox(x1=10, y1=20, x2=30, y2=50))
        with patch('app.routes.detect_furniture', return_value=[detection]):
            response = self.client.post('/analyze', json={'image': self.image})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['image_dimensions'], {'width': 100, 'height': 80})
        self.assertEqual(response.json()['detections'][0]['box'], {'x1': 10, 'y1': 20, 'x2': 30, 'y2': 50})

    def test_invalid_images_and_health(self):
        self.assertEqual(self.client.post('/process', json={'image': 'invalid', 'operation': 'edges'}).status_code, 400)
        self.assertEqual(self.client.get('/health').status_code, 200)

    def test_room_lines_are_json_serializable(self):
        from app.room_analysis import estimate_room_boundaries
        import json, cv2
        pixels=np.zeros((300,400,3),dtype=np.uint8)
        cv2.rectangle(pixels,(20,20),(380,280),(255,255,255),4)
        result=estimate_room_boundaries(pixels)
        self.assertGreater(result['total_lines'],0)
        json.dumps(result)
        with patch('app.routes.detect_furniture',return_value=[]):
            response=self.client.post('/analyze',json={'image':encode_image(pixels,fmt='png'),'include_room':True})
        self.assertEqual(response.status_code,200,response.text)
