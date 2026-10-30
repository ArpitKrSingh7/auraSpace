"""Independent geometry, partial-failure and fallback coverage; no weights/server."""
import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import cv2
import numpy as np
from pydantic import ValidationError

from app.multi_view import fit_registration, merge_geometry, reconstruct_views, register_pair
from app.preprocessing import decode_base64_image, encode_image
from app.room_reconstruction import reconstruct_room, unavailable_room_proposal
from app.schemas import BoundingBox, Detection, ReconstructRequest
from test_room_reconstruction import pinhole_room
from multi_view_fixture import render


def det(label='bed', score=.9):
    return Detection(label=label, class_id=65, score=score, box=BoundingBox(x1=100,y1=150,x2=210,y2=210),
                     mask_polygon=[[100,150],[210,150],[210,210],[100,210]])


class MultiViewGeometryTests(unittest.TestCase):
    def test_actual_overlapping_images_recover_independently_rendered_camera_motion(self):
        frames, poses = [], []
        for offset, yaw in [([0, 0, 0], 0), ([.35, 0, .18], 8)]:
            image, depth, camera, rotation, translation = render(offset, yaw)
            proposal = reconstruct_room(image, depth, 'meters', intrinsics=camera)
            self.assertEqual(proposal['status'], 'estimated')
            frames.append(dict(image=image, depth=depth, proposal=proposal))
            poses.append((rotation, translation))
        result = register_pair(frames[1], frames[0])
        self.assertIsNotNone(result)
        transform, count, residual = result
        self.assertGreater(count, 100)
        self.assertLess(residual, .02)
        np.testing.assert_allclose(transform[:3, 3], poses[0][0].T@(poses[1][1]-poses[0][1]), atol=.02)
        np.testing.assert_allclose(transform[:3, :3], poses[0][0].T@poses[1][0], atol=.02)
        frames[0].update(id='a', detections=[])
        frames[1].update(id='b', detections=[])
        fused = merge_geometry(frames[0], frames, {'a': np.eye(4), 'b': transform})
        self.assertEqual(fused['method'], 'rootsift-depth-sim3-multi-view')
        self.assertGreaterEqual(fused['widthM'], frames[0]['proposal']['widthM'])
        json.dumps(fused, allow_nan=False)

    def test_recovers_rotation_scale_translation_despite_outliers(self):
        rng = np.random.default_rng(5)
        source = rng.uniform(-2, 2, (100,3))
        angle = .25
        rotation = np.array([[np.cos(angle),0,np.sin(angle)],[0,1,0],[-np.sin(angle),0,np.cos(angle)]])
        expected = 1.2*rotation
        target = source@expected.T+[.3,-.2,.5] + rng.normal(0,.008,(100,3))
        target[:25] = rng.uniform(-4,4,(25,3))
        transform, mask, residual = fit_registration(source,target)
        self.assertGreaterEqual(mask.sum(), 74)
        self.assertLess(residual,.025)
        np.testing.assert_allclose(transform[:3,:3], expected,atol=.008)
        np.testing.assert_allclose(transform[:3,3],[.3,-.2,.5],atol=.008)

    def test_unrelated_sparse_collinear_and_unreasonable_scale_are_not_fused(self):
        rng = np.random.default_rng(6)
        points = rng.uniform(-2,2,(70,3))
        for source,target in [(points[:8],points[:8]),(points,rng.uniform(-3,3,(70,3))),
                              (np.column_stack((np.arange(30),np.zeros((30,2)))),np.column_stack((np.arange(30),np.zeros((30,2))))),
                              (points,points*.2)]:
            self.assertIsNone(fit_registration(source,target))

    def test_pair_registration_checks_depth_and_pixel_geometry(self):
        rng = np.random.default_rng(11)
        width,height,focal=500,400,400
        camera=dict(fx=focal,fy=focal,cx=width/2,cy=height/2)
        xyz = np.column_stack((rng.uniform(-1.1,1.1,100),rng.uniform(-.8,.8,100),rng.uniform(2.5,5,100)))
        target_xyz=xyz+[.22,.04,.12]
        descriptors=rng.uniform(0,1,(100,128)).astype(np.float32)
        frames=[]
        for points in (xyz,target_xyz):
            pixels=points[:,:2]/points[:,2,None]*focal+[width/2,height/2]
            depth=np.zeros((height,width),np.float32)
            for (x,y),point in zip(pixels,points):
                u,v=int(round(x)),int(round(y));depth[v-1:v+2,u-1:u+2]=point[2]
            frames.append(dict(image=np.zeros((height,width,3),np.uint8),depth=depth,
                               proposal={'camera':camera},features=(pixels,descriptors)))
        result=register_pair(*frames)
        self.assertIsNotNone(result)
        transform,count,_=result
        self.assertGreaterEqual(count,70)
        np.testing.assert_allclose(transform[:3,3],[.22,.04,.12],atol=.025)
        frames[1]['depth']=None
        self.assertIsNone(register_pair(*frames))

    def test_shared_floor_recovers_furniture_from_a_view_without_its_own_floor(self):
        image,depth,camera,_=pinhole_room()
        proposal=reconstruct_room(image,depth,'meters',intrinsics=camera)
        depth=depth.copy();depth[150:211,100:211]*=.7
        anchor=dict(id='a',image=image,depth=depth,proposal=proposal,detections=[det()])
        second=dict(id='b',image=image,depth=depth,proposal={**unavailable_room_proposal('Test view'), 'camera':proposal['camera']},detections=[det(score=.99)])
        original=copy.deepcopy(proposal)
        fused=merge_geometry(anchor,[anchor,second],{'a':np.eye(4),'b':np.eye(4)})
        self.assertEqual(proposal,original)
        self.assertEqual(len(fused['furniture']),1)  # same physical bed
        self.assertEqual(fused['furniture'][0]['photoId'],'b')
        self.assertEqual(fused['method'],'rootsift-depth-sim3-multi-view')
        self.assertEqual(fused['boundaryEdges'],['view-limit']*4)
        json.dumps(fused,allow_nan=False)


class MultiViewFlowTests(unittest.TestCase):
    def setUp(self):
        self.image,self.depth,self.camera,_=pinhole_room()
        self.proposal=reconstruct_room(self.image,self.depth,'meters',intrinsics=self.camera)
        self.captures=[SimpleNamespace(id=str(i),image=str(i)) for i in range(3)]

    def test_weak_dark_views_do_not_block_a_furnished_best_view(self):
        def analyze(image):
            count=int(image[0,0,0])+1
            return [det() for _ in range(count)],self.depth,copy.deepcopy(self.proposal)
        with patch('app.multi_view.register_pair',return_value=None):
            result=reconstruct_views(self.captures,analyze,lambda value:np.full_like(self.image,int(value)))
        self.assertEqual(result['anchor_photo_id'],'2')
        self.assertEqual(len(result['views']),3)
        self.assertEqual(len(result['views'][2]['detections']),3)
        self.assertEqual([v['status'] for v in result['room_proposal']['multiView']['views']],['reference','reference','anchor'])
        self.assertNotIn('mask_uri',result['views'][2]['detections'][0])
        self.assertTrue(any('best available' in w for w in result['room_proposal']['warnings']))
        json.dumps(result,allow_nan=False)

    def test_corrupt_view_and_failed_analysis_do_not_discard_good_views(self):
        def decode(value):
            if value=='0': raise ValueError('corrupt')
            return np.full_like(self.image,int(value))
        def analyze(image):
            if image[0,0,0]==1: raise RuntimeError('one model failure')
            return [det()],None,unavailable_room_proposal('No metric evidence')
        result=reconstruct_views(self.captures,analyze,decode)
        self.assertEqual(result['anchor_photo_id'],'2')
        self.assertEqual(len(result['room_proposal']['multiView']['views']),3)
        self.assertEqual(len(result['views'][-1]['detections']),1)

    def test_time_budget_keeps_remaining_views_without_discarding_completed_work(self):
        clock=[0.]
        def analyze(image):
            clock[0]+=40
            return [det()],None,unavailable_room_proposal('No metric evidence')
        result=reconstruct_views(self.captures,analyze,lambda _:self.image,budget_s=100,now=lambda:clock[0])
        self.assertEqual(sum(v['analyzed'] for v in result['views']),2)
        self.assertTrue(any('time budget' in v['message'] for v in result['room_proposal']['multiView']['views']))

    def test_all_failed_analysis_still_returns_photos_for_manual_annotation(self):
        result=reconstruct_views(self.captures,lambda _:(_ for _ in ()).throw(RuntimeError('offline')),lambda _:self.image)
        self.assertEqual(result['room_proposal']['status'],'insufficient-evidence')
        self.assertEqual(len(result['views']),3)
        self.assertEqual(sum(v['status']=='anchor' for v in result['room_proposal']['multiView']['views']),1)

    def test_route_returns_compact_per_photo_results_without_depth_images(self):
        from app.routes import reconstruct_photos
        request = ReconstructRequest(photos=[dict(id='room', image=encode_image(self.image, fmt='png'))])
        with patch('app.routes._analyze_capture', return_value=([det()], self.depth, self.proposal)):
            result = reconstruct_photos(request)
        self.assertEqual(result['anchor_photo_id'], 'room')
        self.assertEqual(result['views'][0]['detections'][0]['label'], 'bed')
        self.assertNotIn('depth_raw', result)
        self.assertNotIn('mask_polygon', result['views'][0]['detections'][0])
        self.assertNotIn('fitting', result['room_proposal'])
        json.dumps(result, allow_nan=False)

    def test_request_rejects_only_invalid_transport_not_low_quality_photos(self):
        request=ReconstructRequest(photos=[dict(id='dark',image=encode_image(np.zeros_like(self.image),fmt='png'))])
        result=reconstruct_views(request.photos,lambda _:([det()],None,unavailable_room_proposal('No depth')),decode_base64_image)
        self.assertEqual(len(result['views'][0]['detections']),1)
        with self.assertRaises(ValidationError): ReconstructRequest(photos=[dict(id='same',image='x')]*2)
        with self.assertRaises(ValidationError): ReconstructRequest(photos=[dict(id=str(i),image='x') for i in range(6)])


if __name__=='__main__': unittest.main()
