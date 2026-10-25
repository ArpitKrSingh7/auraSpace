"""Local, pinned metric depth inference; heuristic output is explicitly labelled.

Raw learned values retain metres. Only the display image is normalized. No room
measurements are inferred from a colour map or uncalibrated camera intrinsics.
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib,json,logging,os,threading
from pathlib import Path
import cv2
import numpy as np
import torch
from app.config import DEVICE
logger=logging.getLogger(__name__)
_lock=threading.Lock()
_model=None
_processor=None
_model_version=None

@dataclass
class DepthEstimate:
    values: np.ndarray
    units: str
    model: str
    warnings: list[str]

def _gradient_depth(image):
    gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY).astype(np.float32)
    gx=cv2.Sobel(gray,cv2.CV_32F,1,0,ksize=3);gy=cv2.Sobel(gray,cv2.CV_32F,0,1,ksize=3)
    magnitude=cv2.GaussianBlur(np.sqrt(gx**2+gy**2),(31,31),10)
    spread=float(np.ptp(magnitude));magnitude=(magnitude-float(magnitude.min()))/spread if spread>1e-6 else np.zeros_like(magnitude)
    return (.4*magnitude+.6*np.linspace(0,1,image.shape[0],dtype=np.float32)[:,None]).astype(np.float32)

def _load_depth_model():
    global _model,_processor,_model_version
    if _model is not None:return _model,_processor
    directory=Path(os.environ['METRIC_DEPTH_MODEL_PATH'])
    manifest=json.loads((Path(__file__).resolve().parents[1]/'model-manifest.json').read_text())['metricDepth']
    for entry in manifest['files']:
        if hashlib.sha256((directory/entry['name']).read_bytes()).hexdigest()!=entry['sha256']:raise ValueError('Depth checkpoint failed its checksum check')
    os.environ.setdefault('USE_TF','0')
    os.environ.setdefault('USE_FLAX','0')
    from transformers import AutoImageProcessor,AutoModelForDepthEstimation
    _processor=AutoImageProcessor.from_pretrained(str(directory),local_files_only=True,trust_remote_code=False,use_fast=False)
    _model=AutoModelForDepthEstimation.from_pretrained(str(directory),local_files_only=True,trust_remote_code=False,use_safetensors=True).to(DEVICE).eval()
    _model_version=manifest['repository']+'@'+manifest['revision']
    return _model,_processor

def is_depth_model_loaded():return _model is not None

def estimate_depth_result(image):
    if not os.getenv('METRIC_DEPTH_MODEL_PATH'):
        return DepthEstimate(_gradient_depth(image),'heuristic','Sobel/vertical-position demonstrator',['Metric depth is not configured. This is a texture/position visualization, not measured or learned depth.'])
    with _lock,torch.inference_mode():
        model,processor=_load_depth_model()
        inputs=processor(images=cv2.cvtColor(image,cv2.COLOR_BGR2RGB),return_tensors='pt').to(DEVICE)
        predicted=model(**inputs).predicted_depth
        values=torch.nn.functional.interpolate(predicted[:,None],size=image.shape[:2],mode='bicubic',align_corners=False)[0,0].cpu().numpy()
        if not np.isfinite(values).all() or values.max()<=0:raise ValueError('Depth model returned invalid values')
        return DepthEstimate(np.maximum(values,0).astype(np.float32),'meters',_model_version,['Learned indoor metric depth needs independent room measurements. No camera calibration or hidden boundaries are inferred.'])

def estimate_depth(image):return estimate_depth_result(image).values

def depth_to_visualization(depth):
    values=np.asarray(depth,dtype=np.float32)
    low,high=np.percentile(values,[2,98]);normalized=(values-low)/max(float(high-low),1e-6)
    return cv2.applyColorMap((normalized*255).clip(0,255).astype(np.uint8),cv2.COLORMAP_MAGMA)

def encode_metric_depth(values):
    """16-bit PNG in millimetres, clipped at 65.535 m, lossless in transport."""
    import base64
    millimetres=np.clip(np.rint(values*1000),0,65535).astype(np.uint16)
    ok,png=cv2.imencode('.png',millimetres)
    if not ok:raise ValueError('Could not encode depth')
    return 'data:image/png;base64,'+base64.b64encode(png.tobytes()).decode()
