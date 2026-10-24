"""
Configuration — Morrow Room Studio Vision Service
===================================================
Centralised configuration for model paths, device selection, and tuning knobs.

Environment variables are read once at import time and exposed as module-level
constants so that every other module can simply ``from app.config import …``.
"""

import os
import torch
import logging

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("morrow_vision")

# ---------------------------------------------------------------------------
# Device — prefer CUDA when available, fall back to CPU
# ---------------------------------------------------------------------------
DEVICE: torch.device = torch.device(
    os.getenv("TORCH_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
)
logger.info("Torch device selected: %s", DEVICE)

# ---------------------------------------------------------------------------
# Model configuration
# ---------------------------------------------------------------------------
# Mask R-CNN score threshold: detections below this are discarded.
DETECTION_SCORE_THRESHOLD: float = float(
    os.getenv("DETECTION_SCORE_THRESHOLD", "0.5")
)

# Non-Maximum-Suppression IoU threshold
NMS_IOU_THRESHOLD: float = float(os.getenv("NMS_IOU_THRESHOLD", "0.4"))

# Maximum number of detections returned per image
MAX_DETECTIONS: int = int(os.getenv("MAX_DETECTIONS", "25"))

# COCO class IDs that correspond to "furniture" for room-layout purposes
# fmt: off
FURNITURE_CLASS_IDS: set[int] = {
    57,   # chair  (0-indexed: 56 in some libs, but torchvision uses 1-indexed COCO IDs)
    62,   # chair
    63,   # couch
    64,   # potted plant
    65,   # bed
    67,   # dining table
    70,   # toilet
    72,   # tv
    73,   # laptop
    75,   # clock
    84,   # book
    85,   # vase
}
# fmt: on

# Mapping from COCO class ID → human label
COCO_FURNITURE_LABELS: dict[int, str] = {
    62: "chair",
    63: "couch",
    64: "potted plant",
    65: "bed",
    67: "dining table",
    70: "toilet",
    72: "tv",
    73: "laptop",
    75: "clock",
    84: "book",
    85: "vase",
}

# Full COCO 91-class names (1-indexed) for lookup
COCO_INSTANCE_CATEGORY_NAMES: list[str] = [
    "__background__", "person", "bicycle", "car", "motorcycle", "airplane",
    "bus", "train", "truck", "boat", "traffic light", "fire hydrant",
    "N/A", "stop sign", "parking meter", "bench", "bird", "cat", "dog",
    "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe",
    "N/A", "backpack", "umbrella", "N/A", "N/A", "handbag", "tie",
    "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite",
    "baseball bat", "baseball glove", "skateboard", "surfboard",
    "tennis racket", "bottle", "N/A", "wine glass", "cup", "fork",
    "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
    "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
    "couch", "potted plant", "bed", "N/A", "dining table", "N/A", "N/A",
    "toilet", "N/A", "tv", "laptop", "mouse", "remote", "keyboard",
    "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator",
    "N/A", "book", "clock", "vase", "scissors", "teddy bear",
    "hair drier", "toothbrush",
]

# ---------------------------------------------------------------------------
# Image processing defaults
# ---------------------------------------------------------------------------
# Maximum image dimension (longer side) before resizing for inference
MAX_IMAGE_DIM: int = int(os.getenv("MAX_IMAGE_DIM", "1024"))

# CLAHE clip limit
CLAHE_CLIP_LIMIT: float = float(os.getenv("CLAHE_CLIP_LIMIT", "2.0"))
CLAHE_TILE_SIZE: int = int(os.getenv("CLAHE_TILE_SIZE", "8"))

# Inpainting
INPAINT_RADIUS: int = int(os.getenv("INPAINT_RADIUS", "7"))
INPAINT_MASK_DILATION: int = int(os.getenv("INPAINT_MASK_DILATION", "15"))

# Depth estimation
DEPTH_MODEL_TYPE: str = os.getenv("DEPTH_MODEL_TYPE", "MiDaS_small")

# ---------------------------------------------------------------------------
# Server configuration
# ---------------------------------------------------------------------------
HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = int(os.getenv("PORT", "8000"))
CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "*").split(",")

# ---------------------------------------------------------------------------
# Vercel / lightweight mode
# ---------------------------------------------------------------------------
LIGHTWEIGHT_MODE: bool = os.getenv("LIGHTWEIGHT_MODE", "false").lower() == "true"
