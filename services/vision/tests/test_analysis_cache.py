import unittest
import numpy as np

from app.analysis_cache import CompactAnalysisCache
from app.depth import DepthEstimate
from app.schemas import BoundingBox, Detection


class AnalysisCacheTests(unittest.TestCase):
    def test_keys_distinguish_changed_pixels_dimensions_and_dtype(self):
        image = np.zeros((20, 30, 3), np.uint8)
        key = CompactAnalysisCache.key(image)
        self.assertEqual(key, CompactAnalysisCache.key(image.copy()))
        self.assertNotEqual(key, CompactAnalysisCache.key(image.reshape(30,20,3)))
        image[2,3,0] = 1
        self.assertNotEqual(key, CompactAnalysisCache.key(image))

    def test_cached_detections_are_isolated_and_depth_cannot_be_modified(self):
        cache = CompactAnalysisCache()
        det = Detection(label='chair', class_id=62, score=.9, box=BoundingBox(x1=1,y1=1,x2=4,y2=5))
        depth = np.ones((10,10),np.float32)
        cache.put('a',[det],DepthEstimate(depth,'meters','fixture',[]))
        depth[:]=8;det.label='bed'
        detections,result=cache.get('a')
        self.assertEqual(detections[0].label,'chair')
        self.assertTrue(np.all(result.values == 1))
        with self.assertRaises(ValueError):
            result.values[0,0]=12
        detections[0].label='table'
        self.assertEqual(cache.get('a')[0][0].label,'chair')

    def test_capacity_ttl_and_nonmetric_results_never_reuse_stale_or_unbounded_data(self):
        clock=[0.]
        cache=CompactAnalysisCache(max_bytes=800,ttl_seconds=10,now=lambda:clock[0])
        metric=DepthEstimate(np.ones((10,10),np.float32),'meters','fixture',[])
        cache.put('a',[],metric);cache.put('b',[],metric)
        cache.get('a');cache.put('c',[],metric)
        self.assertIsNone(cache.get('b'))
        self.assertLessEqual(cache.bytes,800)
        cache.put('large',[],DepthEstimate(np.ones((20,20),np.float32),'meters','fixture',[]))
        cache.put('heuristic',[],DepthEstimate(metric.values,'heuristic','fixture',[]))
        self.assertIsNone(cache.get('large'));self.assertIsNone(cache.get('heuristic'))
        clock[0]=11
        self.assertIsNone(cache.get('a'));self.assertEqual(cache.bytes,0)
