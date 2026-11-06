"""
API Schemas — Pydantic models for request / response validation
================================================================
Every endpoint communicates images as **base64 data URIs**
(``data:image/jpeg;base64,/9j/4AAQ…``) so the entire pipeline is
JSON-serialisable and works seamlessly over REST.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel, Field, FiniteFloat, field_validator


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

class CameraIntrinsics(BaseModel):
    """Pinhole calibration in pixels of the oriented source image."""
    fx: float = Field(..., gt=0, le=1_000_000)
    fy: float = Field(..., gt=0, le=1_000_000)
    cx: float
    cy: float

    @field_validator("fx", "fy", "cx", "cy")
    @classmethod
    def finite_intrinsics(cls, value):
        import math
        if not math.isfinite(value):
            raise ValueError("Camera intrinsics must be finite")
        return value


class AnalyzeRequest(BaseModel):
    """Request body for full room analysis."""
    image: str = Field(..., min_length=1, max_length=17_000_000, description="Base64-encoded image (data URI or raw base64)")
    include_depth: bool = Field(False, description="Whether to include depth estimation")
    include_room: bool = Field(False, description="Whether to include room geometry estimation")
    include_artifacts: bool = Field(True, description="Include mask PNGs and cutout thumbnails; disable for compact web drafts")
    include_diagnostics: bool = Field(True, description="Include optional classical room and vanishing-point diagnostics")
    floor_region: Optional[list[tuple[FiniteFloat, FiniteFloat]]] = Field(None, min_length=4, max_length=4)
    intrinsics: Optional[CameraIntrinsics] = Field(
        None, description="Optional calibrated fx, fy, cx, cy in oriented source-image pixels; otherwise a 60 degree horizontal field of view is assumed",
    )


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


class RoomCapture(BaseModel):
    id: str = Field(..., min_length=1, max_length=128, pattern=r'^[a-zA-Z0-9_.:-]+$')
    image: str = Field(..., min_length=1, max_length=3_500_000)
    intrinsics: Optional[CameraIntrinsics] = None
    floor_region: Optional[list[tuple[FiniteFloat, FiniteFloat]]] = Field(None, min_length=4, max_length=4)


class ReconstructRequest(BaseModel):
    photos: list[RoomCapture] = Field(..., min_length=1, max_length=5)

    @field_validator('photos')
    @classmethod
    def unique_captures(cls, photos):
        if len({p.id for p in photos}) != len(photos) or sum(len(p.image) for p in photos) > 3_500_000:
            raise ValueError('Use unique photo IDs and a combined image payload below 3.5 MB')
        return photos


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

MaskCoordinate = Annotated[FiniteFloat, Field(ge=0, le=20_000_000)]
MaskPoint = tuple[MaskCoordinate, MaskCoordinate]
MaskPolygon = Annotated[list[MaskPoint], Field(min_length=3, max_length=1000)]


class ReviewedStroke(BaseModel):
    tool: Literal['paint', 'erase']
    radius: Annotated[FiniteFloat, Field(ge=1, le=500)]
    points: list[MaskPoint] = Field(min_length=1, max_length=3000)


class ReviewedSelection(BaseModel):
    polygons: list[MaskPolygon] = Field(default_factory=list, max_length=100)
    strokes: list[ReviewedStroke] = Field(default_factory=list, max_length=300)
    expansionPx: int = Field(default=0, ge=0, le=100)
    box: Optional[tuple[MaskCoordinate, MaskCoordinate,
                        Annotated[FiniteFloat, Field(gt=0, le=20_000_000)],
                        Annotated[FiniteFloat, Field(gt=0, le=20_000_000)]]] = None


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
        return [ReviewedSelection.model_validate(mask).model_dump() for mask in masks]

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
