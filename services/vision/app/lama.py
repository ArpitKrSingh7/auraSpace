"""Optional verified TorchScript Big-LaMa adapter with bounded OpenCV fallback.

Only operator-configured local checkpoints are loaded, never user-supplied paths.
"""
from app.model_assets import file_sha256
import os
import threading
from pathlib import Path
import cv2
import numpy as np
import torch

_lock=threading.Lock()
_model=None
_manifest=None


def readiness():
    path=os.getenv('LAMA_MODEL_PATH','')
    return bool(path and Path(path).is_file() and os.getenv('LAMA_MODEL_SHA256'))


def _load():
    global _model,_manifest
    if _model is not None:
        return _model
    path=Path(os.environ['LAMA_MODEL_PATH'])
    checksum=file_sha256(path)
    if checksum!=os.environ['LAMA_MODEL_SHA256']:
        raise ValueError('LaMa checkpoint checksum does not match the pinned manifest')
    _model=torch.jit.load(str(path),map_location='cpu').eval()
    _manifest={'architecture':'Big-LaMa','sha256':checksum,'artifact':path.name}
    return _model


def inpaint(image,mask):
    if not readiness():
        raise RuntimeError('LaMa is not configured')
    with _lock,torch.inference_mode():
        model=_load()
        h,w=image.shape[:2]
        scale=min(1,1024/max(h,w))
        ih,iw=max(8,int(round(h*scale))),max(8,int(round(w*scale)))
        rgb=cv2.cvtColor(cv2.resize(image,(iw,ih)),cv2.COLOR_BGR2RGB)
        selected=cv2.resize(mask,(iw,ih),interpolation=cv2.INTER_NEAREST)
        pad_h=(8-ih%8)%8;pad_w=(8-iw%8)%8
        rgb=np.pad(rgb,((0,pad_h),(0,pad_w),(0,0)),mode='reflect')
        selected=np.pad(selected,((0,pad_h),(0,pad_w)),mode='constant')
        tensor=torch.from_numpy(rgb.transpose(2,0,1)).float().unsqueeze(0)/255
        selection=torch.from_numpy(selected).float()[None,None]/255
        output=model(tensor,selection)
        if isinstance(output,dict):
            output=output['inpainted']
        if not isinstance(output,torch.Tensor) or output.ndim!=4 or not torch.isfinite(output).all():
            raise ValueError('LaMa returned invalid pixels')
        pixels=output[0].permute(1,2,0).cpu().numpy()[:ih,:iw]
        pixels=cv2.cvtColor(np.clip(pixels*255,0,255).astype(np.uint8),cv2.COLOR_RGB2BGR)
        return cv2.resize(pixels,(w,h)),f'Big-LaMa TorchScript sha256:{_manifest["sha256"]}'
