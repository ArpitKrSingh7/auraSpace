"""
Furniture Detection — COCO-pretrained Mask R-CNN inference
==========================================================

**Computer Vision concepts demonstrated:**

1. **Instance segmentation** via Mask R-CNN, which extends Faster R-CNN with
   a parallel branch that predicts per-pixel masks for each detected object.
2. **Non-Maximum Suppression (NMS)** to eliminate redundant overlapping
   bounding boxes — only the highest-scoring box survives when IoU > threshold.
3. **Mask → polygon conversion** using ``cv2.findContours`` so that masks
   can be serialised as lightweight vertex lists for front-end rendering.
4. **Transfer learning** — we use weights pre-trained on the 80-class COCO
   dataset and simply *filter* predictions to furniture-relevant categories.

The model is **lazily loaded** on the first inference call to avoid blocking
application startup.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import cv2
import numpy as np
import torch
from torchvision import transforms
from torchvision.models.detection import (
    maskrcnn_resnet50_fpn_v2,
    MaskRCNN_ResNet50_FPN_V2_Weights,
)
from torchvision.ops import nms

from app.config import (
    COCO_INSTANCE_CATEGORY_NAMES,
    DEVICE,
    DETECTION_SCORE_THRESHOLD,
    FURNITURE_CLASS_IDS,
    MAX_DETECTIONS,
    NMS_IOU_THRESHOLD,
)
from app.schemas import BoundingBox, Detection

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy model singleton
# ---------------------------------------------------------------------------
_model: torch.nn.Module | None = None


def _load_model() -> torch.nn.Module:
    """Load Mask R-CNN with COCO-pretrained weights (lazy, thread-unsafe but
    acceptable — FastAPI serialises lifespan events).

    **Computer Vision concept — Transfer learning:**
    Instead of training a detector from scratch, we reuse the feature
    representations learnt on 330 k COCO images.  Because COCO already
    contains furniture classes (chair, couch, bed, dining table, …), no
    fine-tuning is needed — we simply keep predictions whose class ID falls
    in our ``FURNITURE_CLASS_IDS`` set.

    Returns
    -------
    torch.nn.Module
        Mask R-CNN in eval mode on the configured device.
    """
    global _model
    if _model is not None:
        return _model

    logger.info("Loading Mask R-CNN (ResNet-50 FPN v2) on %s …", DEVICE)
    t0 = time.perf_counter()

    weights = MaskRCNN_ResNet50_FPN_V2_Weights.DEFAULT
    model = maskrcnn_resnet50_fpn_v2(weights=weights)
    model.eval()
    model.to(DEVICE)

    elapsed = time.perf_counter() - t0
    logger.info("Mask R-CNN loaded in %.1f s", elapsed)
    _model = model
    return _model


def is_model_loaded() -> bool:
    """Return whether the detection model is currently loaded."""
    return _model is not None


# ---------------------------------------------------------------------------
# Mask → polygon helper
# ---------------------------------------------------------------------------

def _mask_to_polygon(mask: np.ndarray, simplify_epsilon: float = 2.0) -> list[list[float]]:
    """Convert a binary mask to an approximate polygon (list of [x, y] vertices).

    **Computer Vision concept — Contour approximation (Douglas-Peucker):**
    ``cv2.approxPolyDP`` reduces the number of vertices in a contour while
    preserving its shape within a tolerance ``epsilon``.  This is crucial for
    efficient front-end rendering — a full pixel-level contour could have
    thousands of points.

    Parameters
    ----------
    mask : np.ndarray
        HxW binary mask (uint8, 0 or 255).
    simplify_epsilon : float
        Approximation tolerance in pixels.

    Returns
    -------
    list[list[float]]
        List of [x, y] vertices.
    """
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []

    # Pick the largest contour
    largest = max(contours, key=cv2.contourArea)
    epsilon = simplify_epsilon * cv2.arcLength(largest, closed=True) / 100.0
    approx = cv2.approxPolyDP(largest, epsilon, closed=True)
    return approx.reshape(-1, 2).tolist()


# ---------------------------------------------------------------------------
# Main detection entry point
# ---------------------------------------------------------------------------

@torch.no_grad()
def detect_furniture(image: np.ndarray) -> list[Detection]:
    """Run Mask R-CNN inference and return furniture detections.

    **Computer Vision pipeline:**
    1. Convert BGR → RGB → normalised float tensor.
    2. Run forward pass through Mask R-CNN.
    3. Filter by furniture class IDs.
    4. Apply NMS to remove overlapping boxes.
    5. Convert instance masks to simplified polygons.

    Parameters
    ----------
    image : np.ndarray
        HxWx3 BGR uint8 image.

    Returns
    -------
    list[Detection]
        Detected furniture items with boxes, masks, and scores.
    """
    model = _load_model()

    # ── 1. Pre-process ─────────────────────────────────────────────────
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    tensor = transforms.ToTensor()(rgb).to(DEVICE)

    # ── 2. Inference ───────────────────────────────────────────────────
    t0 = time.perf_counter()
    outputs = model([tensor])[0]
    logger.debug("Mask R-CNN inference: %.0f ms", (time.perf_counter() - t0) * 1000)

    boxes: torch.Tensor = outputs["boxes"]       # (N, 4)
    labels: torch.Tensor = outputs["labels"]     # (N,)
    scores: torch.Tensor = outputs["scores"]     # (N,)
    masks: torch.Tensor = outputs["masks"]       # (N, 1, H, W)

    # ── 3. Filter by furniture class IDs & score ───────────────────────
    keep_mask = torch.zeros(len(labels), dtype=torch.bool)
    for idx, (lbl, sc) in enumerate(zip(labels, scores)):
        if int(lbl.item()) in FURNITURE_CLASS_IDS and sc.item() >= DETECTION_SCORE_THRESHOLD:
            keep_mask[idx] = True

    if not keep_mask.any():
        logger.info("No furniture detected above threshold %.2f", DETECTION_SCORE_THRESHOLD)
        return []

    boxes = boxes[keep_mask]
    labels = labels[keep_mask]
    scores = scores[keep_mask]
    masks = masks[keep_mask]

    # ── 4. Non-Maximum Suppression ─────────────────────────────────────
    # **Computer Vision concept — NMS:**
    # When multiple anchor boxes detect the same object, NMS keeps only the
    # highest-scoring box and discards any box whose IoU with it exceeds the
    # threshold.  This prevents duplicate detections.
    nms_indices = nms(boxes, scores, NMS_IOU_THRESHOLD)
    nms_indices = nms_indices[:MAX_DETECTIONS]

    boxes = boxes[nms_indices].cpu().numpy()
    labels = labels[nms_indices].cpu().numpy()
    scores = scores[nms_indices].cpu().numpy()
    masks = masks[nms_indices].cpu().numpy()

    # ── 5. Build Detection objects ─────────────────────────────────────
    detections: list[Detection] = []
    for i in range(len(boxes)):
        class_id = int(labels[i])
        label_name = (
            COCO_INSTANCE_CATEGORY_NAMES[class_id]
            if class_id < len(COCO_INSTANCE_CATEGORY_NAMES)
            else f"class_{class_id}"
        )

        # Binarise the soft mask at 0.5 threshold
        binary_mask = (masks[i, 0] > 0.5).astype(np.uint8) * 255
        polygon = _mask_to_polygon(binary_mask)
        area = float(np.sum(binary_mask > 0))

        x1, y1, x2, y2 = boxes[i].tolist()
        detections.append(
            Detection(
                label=label_name,
                class_id=class_id,
                score=round(float(scores[i]), 4),
                box=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
                mask_polygon=polygon,
                area=area,
            )
        )

    logger.info("Detected %d furniture items", len(detections))
    return detections
