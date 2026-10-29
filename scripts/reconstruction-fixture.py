"""Analytic geometry fixture for verify-room-reconstruction.mjs; no models."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(root / 'services/vision'), str(root / 'services/vision/tests')]

import numpy as np
from test_room_reconstruction import pinhole_room
from app.room_reconstruction import reconstruct_room

image, depth, camera, labels = pinhole_room()
points = [(110, 180), (200, 200)]
world = []
for u, v in points:
    assert labels[v, u] == 0
    world.append(depth[v, u] * np.array([
        (u - camera['cx']) / camera['fx'], (v - camera['cy']) / camera['fy'], 1.,
    ]))
# Bias the depth scale; only the independent floor measurement may correct it.
proposal = reconstruct_room(image, depth * .8, 'meters', intrinsics=camera)
print(json.dumps({
    'proposal': proposal, 'points': points,
    'lengthM': float(np.linalg.norm(world[1] - world[0])),
}, allow_nan=False))
