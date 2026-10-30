"""Bounded, optional multi-view registration. Weak photos remain references.

RootSIFT correspondences + depth-backed Sim(3) RANSAC align camera frames.
This is sparse registration, not dense photogrammetry or a metric room scan.
"""
from __future__ import annotations

import copy
import logging
import math
import time
from typing import Callable

import cv2
import numpy as np

from app.room_reconstruction import unavailable_room_proposal

logger = logging.getLogger(__name__)


def quality(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, (320, 240))
    sharpness = float(cv2.Laplacian(gray, cv2.CV_32F).var())
    light = float(gray.mean())
    message = 'A sharper photo may help.' if sharpness < 35 else 'More light may help.' if light < 45 else None
    return min(sharpness, 300) / 300 + min(light, 110) / 110, message


def features(image):
    # Keep coordinates in the inference image. Bound extraction and pair memory.
    scale = min(1., 1024 / max(image.shape[:2]))
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    if scale < 1:
        gray = cv2.resize(gray, None, fx=scale, fy=scale)
    keypoints, descriptors = cv2.SIFT_create(nfeatures=2200, contrastThreshold=.008).detectAndCompute(gray, None)
    if descriptors is None:
        return np.empty((0, 2)), np.empty((0, 128), np.float32)
    descriptors = np.sqrt(descriptors / np.maximum(descriptors.sum(axis=1, keepdims=True), 1e-6))
    return np.array([k.pt for k in keypoints]) / scale, descriptors


def similarity(source, target):
    """Proper rotation + uniform scale, mapping source camera to target camera."""
    a, b = source.mean(axis=0), target.mean(axis=0)
    x, y = source - a, target - b
    u, values, vt = np.linalg.svd(y.T @ x)
    signs = np.ones(3)
    signs[-1] = np.linalg.det(u @ vt)
    rotation = (u * signs) @ vt
    scale = float(np.sum(values * signs) / max(float(np.sum(x * x)), 1e-12))
    return scale * rotation, b - scale * rotation @ a


def fit_registration(source, target, seed=23):
    """Reject underconstrained/degenerate evidence; never reject a photo itself."""
    if len(source) < 10 or not np.isfinite(source).all() or not np.isfinite(target).all():
        return None
    rng = np.random.default_rng(seed)
    best = np.zeros(len(source), dtype=bool)
    tolerance = .12
    for _ in range(600):
        sample = rng.choice(len(source), 3, replace=False)
        if np.linalg.svd(source[sample] - source[sample].mean(0), compute_uv=False)[1] < .04:
            continue
        linear, translation = similarity(source[sample], target[sample])
        scale = np.cbrt(np.linalg.det(linear))
        if not .5 < scale < 2:
            continue
        mask = np.linalg.norm(source @ linear.T + translation - target, axis=1) < tolerance
        if mask.sum() > best.sum():
            best = mask
    if best.sum() < max(10, math.ceil(len(source) * .4)):
        return None
    for _ in range(2):
        linear, translation = similarity(source[best], target[best])
        errors = np.linalg.norm(source @ linear.T + translation - target, axis=1)
        best = errors < tolerance
        if best.sum() < 10:
            return None
    spread = np.linalg.svd(target[best] - target[best].mean(0), compute_uv=False) / math.sqrt(best.sum())
    scale = float(np.cbrt(np.linalg.det(linear)))
    if spread[1] < .12 or not .5 < scale < 2 or np.median(errors[best]) > .09:
        return None
    transform = np.eye(4)
    transform[:3, :3], transform[:3, 3] = linear, translation
    return transform, best, float(np.median(errors[best]))


def camera_for(frame):
    camera = frame['proposal'].get('camera')
    if camera:
        return camera
    h, w = frame['image'].shape[:2]
    focal = w / (2 * math.tan(math.pi / 6))
    return dict(fx=focal, fy=focal, cx=w / 2, cy=h / 2)


def backproject(pixels, frame):
    depth = frame['depth']
    h, w = depth.shape
    u, v = pixels.T
    # Median patch reduces single-pixel depth-edge failures.
    z = []
    for x, y in zip(u, v):
        xi, yi = int(round(x)), int(round(y))
        z.append(np.median(depth[max(0, yi-1):min(h, yi+2), max(0, xi-1):min(w, xi+2)]))
    z = np.asarray(z)
    k = camera_for(frame)
    return np.column_stack(((u-k['cx'])*z/k['fx'], (v-k['cy'])*z/k['fy'], z))


def register_pair(source, target):
    if source.get('depth') is None or target.get('depth') is None:
        return None
    for frame in (source, target):
        if 'features' not in frame:
            frame['features'] = features(frame['image'])
    (ps, ds), (pt, dt) = source['features'], target['features']
    if min(len(ds), len(dt)) < 10:
        return None
    matcher = cv2.BFMatcher()
    forward = matcher.knnMatch(ds, dt, k=2)
    reverse = {m.queryIdx: m.trainIdx for pair in matcher.knnMatch(dt, ds, k=2) if len(pair) == 2 for m, n in [pair] if m.distance < .8*n.distance}
    matches = [m for pair in forward if len(pair) == 2 for m, n in [pair] if m.distance < .8*n.distance and reverse.get(m.trainIdx) == m.queryIdx]
    if len(matches) < 12:
        return None
    a, b = ps[[m.queryIdx for m in matches]], pt[[m.trainIdx for m in matches]]
    _, epipolar = cv2.findFundamentalMat(a, b, cv2.USAC_MAGSAC, 2.5, .999)
    if epipolar is None or epipolar.sum() < 10:
        return None
    good = epipolar.ravel().astype(bool)
    a, b = a[good], b[good]
    x, y = backproject(a, source), backproject(b, target)
    valid = (x[:, 2] > .15) & (y[:, 2] > .15) & (x[:, 2] < 25) & (y[:, 2] < 25)
    a, b, x, y = a[valid], b[valid], x[valid], y[valid]
    result = fit_registration(x, y)
    if result is None:
        return None
    transform, inliers, residual = result
    # A valid sparse fit must also agree with independently fitted floor planes.
    sf, tf = source['proposal'].get('fitting', {}), target['proposal'].get('fitting', {})
    if all('floorNormalCamera' in f and 'floorOffsetM' in f for f in (sf, tf)):
        scale = np.cbrt(np.linalg.det(transform[:3, :3]))
        normal = transform[:3, :3] @ np.asarray(sf['floorNormalCamera']) / scale
        offset = scale*sf['floorOffsetM'] - normal@transform[:3, 3]
        if normal@np.asarray(tf['floorNormalCamera']) < math.cos(math.radians(15)) or abs(offset-tf['floorOffsetM']) > .25:
            return None
    # Independent pixel reprojection check prevents plausible but wrong 3D fits.
    mapped = x @ transform[:3, :3].T + transform[:3, 3]
    k = camera_for(target)
    reproj = np.column_stack((mapped[:, 0]*k['fx']/np.maximum(mapped[:, 2], .01)+k['cx'], mapped[:, 1]*k['fy']/np.maximum(mapped[:, 2], .01)+k['cy']))
    if np.median(np.linalg.norm(reproj[inliers]-b[inliers], axis=1)) > 10:
        return None
    for pixels, frame in ((a[inliers], source), (b[inliers], target)):
        h, w = frame['image'].shape[:2]
        if np.ptp(pixels[:, 0]) < w*.12 or np.ptp(pixels[:, 1]) < h*.12:
            return None
    return transform, int(inliers.sum()), residual


def merge_geometry(anchor, frames, transforms):
    """Project all aligned views onto one floor; no averaging of room widths."""
    proposal = copy.deepcopy(anchor['proposal'])
    fit = proposal.get('fitting', {})
    required = ['floorOriginCamera', 'floorXAxisCamera', 'floorZAxisCamera', 'floorNormalCamera', 'floorOffsetM']
    if not all(key in fit for key in required):
        return proposal
    origin, axis_x, axis_z, normal = (np.asarray(fit[k], dtype=float) for k in required[:4])
    merged, floor_samples = [], []
    for frame in frames:
        transform = transforms.get(frame['id'])
        if transform is None:
            continue
        linear, offset = transform[:3, :3], transform[:3, 3]
        scale = float(np.cbrt(np.linalg.det(linear)))
        own_fit = frame['proposal'].get('fitting', {})
        if all(k in own_fit for k in required[:4]):
            # Add independently supported floor extents in the common frame.
            # Keep every boundary uncertain: a photo crop is not a measured wall.
            own_origin, own_x, own_z = (np.asarray(own_fit[k]) for k in required[:3])
            for x, z in frame['proposal'].get('floorPolygonXZ', []):
                point = linear @ (own_origin+x*own_x+z*own_z)+offset
                if abs(point@normal+fit['floorOffsetM']) < .2:
                    floor_samples.append([(point-origin)@axis_x, (point-origin)@axis_z])
        # Use the common floor to recover furniture even when this view could
        # not fit its own visible floor. This is the main benefit of registration.
        local_origin = np.linalg.solve(linear, origin-offset)
        rotation = linear / scale
        local_fit = dict(floorOriginCamera=local_origin.tolist(), floorXAxisCamera=(rotation.T@axis_x).tolist(),
                         floorZAxisCamera=(rotation.T@axis_z).tolist(), floorNormalCamera=(rotation.T@normal).tolist(),
                         floorOffsetM=float((normal@offset+fit['floorOffsetM'])/scale))
        from app.furniture_layout import populate_room_proposal
        local = {**proposal, 'camera': camera_for(frame), 'fitting': local_fit,
                 'widthM': proposal['widthM']/scale, 'depthM': proposal['depthM']/scale,
                 'imageToFloor': [1,0,0,0,1,0,0,0,1], 'furniture': []}
        projected = populate_room_proposal(local, frame['detections'], frame['depth'])
        # populate may expand/rebase; undo its shift before common-floor mapping.
        shifted = np.asarray(projected['fitting']['floorOriginCamera']) - local_origin
        shift = np.array([shifted @ local_fit['floorXAxisCamera'], shifted @ local_fit['floorZAxisCamera']])
        for item in projected.get('furniture', []):
            candidate = {**item, 'photoId': frame['id'],
                         'centerXZ': ((np.asarray(item['centerXZ'])+shift)*scale).tolist(),
                         'widthM': item['widthM']*scale, 'depthM': item['depthM']*scale, 'heightM': item['heightM']*scale}
            det = frame['detections'][item['detectionIndex']]
            candidate['_label'], candidate['_score'] = det.label, det.score
            duplicate = next((other for other in merged if other['_label'] == det.label and
                              np.linalg.norm(np.asarray(other['centerXZ'])-candidate['centerXZ']) < min(.55, .35*max(other['widthM'], other['depthM']))), None)
            if duplicate is None:
                merged.append(candidate)
            elif det.score > duplicate['_score']:
                merged[merged.index(duplicate)] = candidate
    if not merged and not floor_samples:
        return proposal
    lower, upper = np.array([0., 0.]), np.array([proposal['widthM'], proposal['depthM']])
    if floor_samples:
        lower = np.minimum(lower, np.min(floor_samples, axis=0))
        upper = np.maximum(upper, np.max(floor_samples, axis=0))
    for item in merged:
        angle = math.radians(item['rotationDeg'])
        half = np.array([abs(math.cos(angle))*item['widthM']+abs(math.sin(angle))*item['depthM'], abs(math.sin(angle))*item['widthM']+abs(math.cos(angle))*item['depthM']])/2
        lower = np.minimum(lower, np.asarray(item['centerXZ'])-half-.04)
        upper = np.maximum(upper, np.asarray(item['centerXZ'])+half+.04)
    size = upper-lower
    if size.max() > 30:
        return proposal
    for item in merged:
        item['centerXZ'] = (np.asarray(item['centerXZ'])-lower).tolist()
        item.pop('_label'); item.pop('_score')
    h = np.asarray(proposal['imageToFloor'], dtype=np.float64).reshape(3,3)
    h[:2] -= lower[:,None]*h[2]
    proposal.update(widthM=float(size[0]), depthM=float(size[1]), floorCornersPx=[],
                    floorPolygonXZ=[[0,0],[float(size[0]),0],size.tolist(),[0,float(size[1])]],
                    imageToFloor=h.ravel().tolist(), furniture=merged,
                    boundaryEdges=['view-limit']*4,
                    fitting={**fit, 'floorOriginCamera': (origin+axis_x*lower[0]+axis_z*lower[1]).tolist()},
                    method='rootsift-depth-sim3-multi-view', partial=True, confidence='low')
    proposal['warnings'] = [*proposal['warnings'], 'Aligned photos share a floor frame. Boundaries remain partial; confirm scale with a real measurement.'][-20:]
    return proposal


def reconstruct_views(captures, analyze: Callable, decode: Callable, budget_s=125., now=time.monotonic):
    start = now()
    frames, reports = [], []
    for capture in captures:
        report = dict(photoId=capture.id, status='reference', message='Kept as a reference.')
        reports.append(report)
        try:
            image = decode(capture.image)
            resize = min(1., 1280/max(image.shape[:2]))
            if resize < 1:
                image = cv2.resize(image, None, fx=resize, fy=resize, interpolation=cv2.INTER_AREA)
            score, hint = quality(image)
            frames.append(dict(id=capture.id, image=image, quality=score, hint=hint, report=report))
            if hint:
                report['message'] = hint + ' Kept as a reference.'
        except Exception:
            report['message'] = 'This file could not be read. The other photos can still be used.'
    ordered = sorted(frames, key=lambda f: f['quality'], reverse=True)
    last_cost = 25.
    for index, frame in enumerate(ordered):
        if index and budget_s-(now()-start) < max(30., last_cost*1.15)+5:
            frame['report']['message'] = 'Kept as a reference; the processing time budget was reached.'
            continue
        try:
            frame_start = now()
            detections, depth, proposal = analyze(frame['image'])
            last_cost = max(1., now()-frame_start)
            for detection in detections:
                detection.mask_uri = detection.raw_mask_uri = detection.thumbnail_uri = None
            frame.update(detections=detections, depth=depth, proposal=proposal)
            frame['report']['message'] = 'Analyzed; no reliable overlap found yet.' + (' '+frame['hint'] if frame['hint'] else '')
        except Exception:
            logger.exception('One room view could not finish; keeping the other views')
            frame['report']['message'] = 'Analysis could not finish. Kept as a reference.'
    analyzed = [f for f in frames if 'proposal' in f]
    if not analyzed:
        anchor = frames[0] if frames else None
        proposal = unavailable_room_proposal('Photo analysis could not finish. Mark furniture in a reference photo or try again.')
    else:
        anchor = max(analyzed, key=lambda f: (f['proposal'].get('status') == 'estimated', len(f['proposal'].get('furniture', [])), len(f['detections']), f['quality']))
        proposal = copy.deepcopy(anchor['proposal'])
    if anchor:
        anchor['report'].update(status='anchor', message='Starting view for your furnished draft.')
    transforms = {anchor['id']: np.eye(4)} if anchor else {}
    if anchor and proposal.get('status') == 'estimated':
        remaining = [f for f in analyzed if f is not anchor]
        # Breadth-first connection allows a middle view to bridge two corners.
        queue = [anchor]
        while queue:
            target = queue.pop(0)
            for source in remaining[:]:
                if source is target or now()-start > budget_s-3:
                    continue
                try:
                    pair = register_pair(source, target)
                    if pair is None:
                        continue
                    transform, count, residual = pair
                    transforms[source['id']] = transforms[target['id']] @ transform
                    source['report'].update(status='aligned', inlierCount=count, residualM=round(residual,4), message='Aligned with the starting view.')
                    remaining.remove(source)
                    queue.append(source)
                except Exception:
                    logger.exception('Optional photo alignment failed; retaining best-view draft')
        if len(transforms) > 1:
            try:
                proposal = merge_geometry(anchor, analyzed, transforms)
            except Exception:
                logger.exception('Multi-view fusion failed; retaining best-view draft')
                for report in reports:
                    if report['status'] == 'aligned':
                        report.update(status='reference', message='Alignment could not be fused. Kept as a reference.')
    proposal.pop('fitting', None)
    proposal['multiView'] = dict(anchorPhotoId=anchor['id'] if anchor else captures[0].id, views=reports)
    if not any(r['status'] == 'aligned' for r in reports):
        proposal['warnings'] = [*proposal['warnings'], 'Using the best available single view. Other photos remain references; their dimensions were not averaged.'][-20:]
    return dict(anchor_photo_id=proposal['multiView']['anchorPhotoId'], room_proposal=proposal,
                views=[dict(photo_id=f['id'], detections=[d.model_dump(exclude={'mask_uri','raw_mask_uri','thumbnail_uri','mask_polygon'}) for d in f.get('detections',[])],
                            image_dimensions=dict(width=f['image'].shape[1],height=f['image'].shape[0]), analyzed='proposal' in f) for f in frames],
                processing_time_ms=round((now()-start)*1000))
