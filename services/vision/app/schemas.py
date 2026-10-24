"""
API Schemas — Pydantic models for request / response validation
================================================================
Every endpoint communicates images as **base64 data URIs**
(``data:image/jpeg;base64,/9j/4AAQ…``) so the entire pipeline is
JSON-serialisable and works seamlessly over REST.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


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


# ── /analyze ───────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    """Request body for full room analysis."""
    image: str = Field(..., description="Base64-encoded image (data URI or raw base64)")
    include_depth: bool = Field(False, description="Whether to include depth estimation")
    include_room: bool = Field(False, description="Whether to include room geometry estimation")


class AnalyzeResponse(BaseModel):
    """Response containing detected furniture, optional depth map, and room info."""
    detections: list[Detection] = Field(default_factory=list)
    depth_map: Optional[str] = Field(None, description="Base64 depth visualisation")
    room_estimate: Optional[dict[str, Any]] = Field(None)
    image_dimensions: dict[str, int] = Field(default_factory=dict)
    processing_time_ms: float = Field(..., description="Total wall-clock time in ms")


# ── /process ───────────────────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    """Request body for a single image-processing operation."""
    image: str = Field(..., description="Base64-encoded image")
    operation: Literal[
        "grayscale", "contrast", "edges", "clahe", "contours", "histogram"
    ] = Field(..., description="Processing operation to apply")
    params: dict[str, Any] = Field(
        default_factory=dict, description="Optional operation-specific parameters"
    )


class ProcessResponse(BaseModel):
    """Processed image result."""
    uri: str = Field(..., description="Base64 data URI of the processed image")
    metadata: dict[str, Any] = Field(
        default_factory=dict, description="Extra data (e.g. histogram bins)"
    )


# ── /inpaint ───────────────────────────────────────────────────────────────

class InpaintRequest(BaseModel):
    """Request to remove furniture from an image."""
    image: str = Field(..., description="Base64-encoded image")
    boxes: list[list[float]] = Field(
        ...,
        description="List of bounding boxes [x1, y1, x2, y2] marking regions to remove",
    )
    method: Literal["telea", "navier-stokes", "auto"] = Field(
        "auto", description="Inpainting algorithm to use"
    )


class InpaintResponse(BaseModel):
    """Inpainted image result."""
    uri: str = Field(..., description="Base64 data URI of the inpainted image")
    method: str = Field(..., description="Algorithm actually used")


# ── /depth ─────────────────────────────────────────────────────────────────

class DepthRequest(BaseModel):
    """Request for monocular depth estimation."""
    image: str = Field(..., description="Base64-encoded image")


class DepthResponse(BaseModel):
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
