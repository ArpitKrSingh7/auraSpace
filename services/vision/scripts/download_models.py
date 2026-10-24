#!/usr/bin/env python3
"""
Model Weights Downloader
=========================
Downloads and caches pretrained PyTorch Mask R-CNN and Depth estimation models
so the vision service can operate offline and quickly in containerized environments.
"""

import sys
import logging
import torch
from torchvision.models.detection import maskrcnn_resnet50_fpn_v2, MaskRCNN_ResNet50_FPN_V2_Weights

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("download_models")

def download_mask_rcnn():
    logger.info("Downloading Mask R-CNN ResNet-50 FPN v2 weights...")
    weights = MaskRCNN_ResNet50_FPN_V2_Weights.DEFAULT
    model = maskrcnn_resnet50_fpn_v2(weights=weights)
    model.eval()
    logger.info("✓ Mask R-CNN weights verified and cached.")

def download_depth_model():
    logger.info("Downloading MiDaS / Depth model...")
    try:
        model = torch.hub.load("intel-isl/MiDaS", "MiDaS_small", pretrained=True)
        model.eval()
        logger.info("✓ MiDaS small depth model cached.")
    except Exception as e:
        logger.warning(f"Depth model download optional or offline fallback active: {e}")

if __name__ == "__main__":
    logger.info("Starting model asset caching...")
    download_mask_rcnn()
    download_depth_model()
    logger.info("All model download tasks completed.")
