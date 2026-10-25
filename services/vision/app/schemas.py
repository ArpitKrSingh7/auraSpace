"""
API Schemas — Pydantic models for request / response validation
================================================================
Every endpoint communicates images as **base64 data URIs**
(``data:image/jpeg;base64,/9j/4AAQ…``) so the entire pipeline is
JSON-serialisable and works seamlessly over REST.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ── Shared primitives ──────────────────────────────────────────────────────

class BoundingBox(BaseModel):
    """Axis-aligned bounding box in pixel coordinates [x1, y1, x2, y2]."""
    x1: float
    y1: float
    x2: float
    y2: float


class Detection(BaseModel):
    """Single detected object with its mask polygon and metadata."""
    label: str = Field(..., description="Human-readable class name, e.g. 'chair'")
    class_id: int = Field(..., description="COCO class ID (1-indexed)")
    score: float = Field(..., ge=0.0, le=1.0, description="Confidence score")
    box: BoundingBox
    mask_polygon: list[list[float]] = Field(
        default_factory=list,
        description="List of [x, y] vertices approximating the instance mask",
    )
    area: float = Field(0.0, description="Mask area in pixels")
    mask_uri: Optional[str] = None
    raw_mask_uri: Optional[str] = None
    thumbnail_uri: Optional[str] = None
    color: Optional[str] = None
    centroid: Optional[list[float]] = None


# ── /analyze ───────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    """Request body for full room analysis."""
    image: str = Field(..., min_length=1, max_length=17_000_000, description="Base64-encoded image (data URI or raw base64)")
    include_depth: bool = Field(False, description="Whether to include depth estimation")
    include_room: bool = Field(False, description="Whether to include room geometry estimation")


class AnalyzeResponse(BaseModel):
    """Response containing detected furniture, optional depth map, and room info."""
    detections: list[Detection] = Field(default_factory=list)
    depth_map: Optional[str] = Field(None, description="Base64 depth visualisation")
    depth_raw: Optional[str] = None
    depth_metadata: Optional[dict[str, Any]] = None
    room_estimate: Optional[dict[str, Any]] = Field(None)
    image_dimensions: dict[str, int] = Field(default_factory=dict)
    processing_time_ms: float = Field(..., description="Total wall-clock time in ms")
    room_proposal: Optional[dict[str, Any]] = None
    warnings: list[str] = Field(default_factory=list)
    model_versions: dict[str, str] = Field(default_factory=dict)


# ── /process ───────────────────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    """Request body for a single image-processing operation."""
    image: str = Field(..., min_length=1, max_length=17_000_000, description="Base64-encoded image")
    operation: Literal[
        "grayscale", "contrast", "edges", "clahe", "contours", "histogram"
    ] = Field(..., description="Processing operation to apply")
    params: dict[str, Any] = Field(
        default_factory=dict, description="Optional operation-specific parameters"
    )

    @field_validator("params")
    @classmethod
    def valid_params(cls, params):
        import math
        for key, upper in [("factor", 5), ("min_area", 20_000_000)]:
            if key in params:
                value = params[key]
                if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0 or value > upper:
                    raise ValueError(f"Invalid {key}")
        if params.get("method", "canny") not in ("canny", "sobel"):
            raise ValueError("Unsupported edge method")
        return params


class ProcessResponse(BaseModel):
    """Processed image result."""
    uri: str = Field(..., description="Base64 data URI of the processed image")
    metadata: dict[str, Any] = Field(
        default_factory=dict, description="Extra data (e.g. histogram bins)"
    )


# ── /inpaint ───────────────────────────────────────────────────────────────

class InpaintRequest(BaseModel):
    """Request to remove furniture from an image."""
    image: str = Field(..., min_length=1, max_length=17_000_000, description="Base64-encoded image")
    boxes: list[list[float]] = Field(
        default_factory=list, max_length=100,
        description="List of bounding boxes [x, y, width, height] in source-image pixels",
    )
    masks: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    prefer_lama: bool = True

    @field_validator("masks")
    @classmethod
    def valid_masks(cls, masks):
        import math
        for mask in masks:
            if not 0 <= mask.get('expansionPx', 0) <= 100 or len(mask.get('polygons', [])) > 100 or len(mask.get('strokes', [])) > 300:
                raise ValueError('Mask exceeds review limits')
            for polygon in mask.get('polygons', []):
                if not 3 <= len(polygon) <= 1000 or any(len(p)!=2 or not all(math.isfinite(v) and v>=0 for v in p) for p in polygon):
                    raise ValueError('Invalid mask polygon')
            for stroke in mask.get('strokes', []):
                if stroke.get('tool') not in ('paint', 'erase') or not 1 <= stroke.get('radius', 0) <= 500 or not 1 <= len(stroke.get('points', [])) <= 3000:
                    raise ValueError('Invalid brush stroke')
                if any(len(p)!=2 or not all(math.isfinite(v) and v>=0 for v in p) for p in stroke['points']):
                    raise ValueError('Invalid brush coordinates')
        return masks

    @field_validator("boxes")
    @classmethod
    def valid_boxes(cls, boxes):
        import math
        for box in boxes:
            if len(box) != 4 or not all(math.isfinite(v) for v in box) or min(box[:2]) < 0 or min(box[2:]) <= 0:
                raise ValueError("Boxes require finite x, y, positive width and height")
        return boxes

    method: Literal["telea", "navier-stokes", "auto"] = Field(
        "auto", description="Inpainting algorithm to use"
    )


class InpaintResponse(BaseModel):
    """Inpainted image result."""
    uri: str = Field(..., description="Base64 data URI of the inpainted image")
    method: str = Field(..., description="Algorithm actually used")
    warnings: list[str] = Field(default_factory=list)
    mask_uri: Optional[str] = None


# ── /depth ─────────────────────────────────────────────────────────────────

class DepthRequest(BaseModel):
    """Request for monocular depth estimation."""
    image: str = Field(..., min_length=1, max_length=17_000_000, description="Base64-encoded image")


class DepthResponse(BaseModel):
    units: str = "heuristic"
    model: str = "unconfigured"
    warnings: list[str] = Field(default_factory=list)
    raw_depth: Optional[str] = None
    """Depth estimation result."""
    depth_map: str = Field(..., description="Base64 grayscale depth map")
    visualization: str = Field(..., description="Base64 colourised depth map")


# ── /health ────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    """Service health status."""
    status: str = "ok"
    version: str = "1.0.0"
    models_loaded: dict[str, bool] = Field(default_factory=dict)
    device: str = "cpu"
