"""Bounded RAM reuse of compact inference; geometry is always fitted afresh.

Keys hash decoded pixels and image shape. Only metric depth is retained; no
failures, heuristic maps, output geometry or base64 image artifacts are cached.
"""
from collections import OrderedDict
import copy
import hashlib
import threading
import time

import numpy as np

from app.depth import DepthEstimate


class CompactAnalysisCache:
    def __init__(self, max_bytes=32 * 1024 * 1024, ttl_seconds=90, now=time.monotonic):
        self.max_bytes, self.ttl_seconds, self.now = max_bytes, ttl_seconds, now
        self.entries = OrderedDict()
        self.bytes = 0
        self.lock = threading.Lock()

    @staticmethod
    def key(image):
        digest = hashlib.sha256(str((image.shape, image.dtype.str)).encode())
        digest.update(memoryview(np.ascontiguousarray(image)))
        return digest.digest()

    def _expire(self):
        now = self.now()
        for key, (expires, _, _, size) in list(self.entries.items()):
            if expires <= now:
                self.bytes -= size
                del self.entries[key]

    def get(self, key):
        with self.lock:
            self._expire()
            entry = self.entries.get(key)
            if entry is None:
                return None
            self.entries.move_to_end(key)
            _, detections, result, _ = entry
            # Clients may annotate detections. Shared depth is read-only.
            return copy.deepcopy(detections), DepthEstimate(result.values, result.units, result.model, list(result.warnings))

    def put(self, key, detections, result):
        if result.units != 'meters' or any(d.mask_uri or d.raw_mask_uri or d.thumbnail_uri for d in detections):
            return
        # Account conservatively for Python contour objects and metadata too.
        size = result.values.nbytes + sum(2048 + len(d.mask_polygon) * 128 for d in detections)
        if size > self.max_bytes:
            return
        values = result.values.copy()
        values.flags.writeable = False
        cached = DepthEstimate(values, result.units, result.model, list(result.warnings))
        with self.lock:
            self._expire()
            previous = self.entries.pop(key, None)
            if previous:
                self.bytes -= previous[3]
            while self.entries and self.bytes + size > self.max_bytes:
                self.bytes -= self.entries.popitem(last=False)[1][3]
            self.entries[key] = (self.now() + self.ttl_seconds, copy.deepcopy(detections), cached, size)
            self.bytes += size


compact_analysis_cache = CompactAnalysisCache()
