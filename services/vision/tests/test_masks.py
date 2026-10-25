import unittest
import numpy as np
from app.masks import reviewed_mask
from app.depth import encode_metric_depth
from app.preprocessing import decode_base64_image
import cv2,base64
class TestReviewedMasks(unittest.TestCase):
    def test_erase_and_paint_use_source_pixels(self):
        mask=reviewed_mask((80,100,3),[{'box':[10,10,30,30],'polygons':[[[10,10],[40,10],[40,40],[10,40]]],'strokes':[{'tool':'erase','radius':5,'points':[[20,20]]},{'tool':'paint','radius':3,'points':[[60,60]]}],'expansionPx':0}])
        self.assertEqual(mask[20,20],0)
        self.assertEqual(mask[60,60],255)
        self.assertEqual(mask[0,0],0)
    def test_full_removal_and_empty_selection_are_rejected(self):
        for masks in [[],[{'box':[0,0,100,80],'polygons':[],'strokes':[],'expansionPx':0}]]:
            with self.assertRaises(ValueError):reviewed_mask((80,100,3),masks)
    def test_metric_depth_png_retains_millimeters(self):
        depth=np.array([[1.234,2.5],[0,65.6]],dtype=np.float32)
        uri=encode_metric_depth(depth)
        decoded=cv2.imdecode(np.frombuffer(base64.b64decode(uri.split(',')[1]),np.uint8),cv2.IMREAD_UNCHANGED)
        self.assertEqual(decoded.dtype,np.uint16)
        self.assertEqual(decoded.tolist(),[[1234,2500],[0,65535]])
