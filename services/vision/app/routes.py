"""
Vision Service Routes — FastAPI router definitions
===================================================

Endpoints:
- POST /analyze: Furniture detection + optional depth + room layout estimation
- POST /process: Classical image processing (CLAHE, edges, grayscale, contrast, morphology, contours, histogram)
- POST /inpaint: Furniture removal and floor/wall restoration
- POST /depth: Monocular depth estimation and colorized visualization
- GET /health: Service health and model status
"""

from __future__ import annotations

import logging
import time
import cv2
import numpy as np
from app.masks import reviewed_mask
from app.lama import readiness as lama_ready, inpaint as lama_inpaint
from app.inpainting import composite_result
from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.depth import depth_to_visualization, estimate_depth, estimate_depth_result, encode_metric_depth, is_depth_model_loaded
from app.inference import detect_furniture, is_model_loaded
from app.inpainting import create_removal_mask, remove_furniture
from app.preprocessing import (
    apply_clahe,
    apply_morphology,
    compute_histogram,
    decode_base64_image,
    detect_edges,
    encode_image,
    enhance_contrast,
    extract_contours,
    normalize_orientation,
    to_grayscale,
)
from app.room_analysis import detect_vanishing_points, estimate_room_boundaries
from app.room_reconstruction import reconstruct_room, unavailable_room_proposal
from app.furniture_layout import populate_room_proposal
from app.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    DepthRequest,
    DepthResponse,
    InpaintRequest,
    InpaintResponse,
    ProcessRequest,
    ProcessResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    summary="Detect furniture in a room image",
    description="Runs Mask R-CNN instance segmentation to detect furniture items. Optionally predicts metric depth and room boundary contours.",
)
def analyze_room(req: AnalyzeRequest) -> AnalyzeResponse:
    start_time = time.perf_counter()
    try:
        image = decode_base64_image(req.image)
        image = normalize_orientation(image)
    except Exception as exc:
        logger.warning(f"Failed to decode image in /analyze: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image data: {exc}",
        )

    h, w = image.shape[:2]

    # 1. Furniture detection
    try:
        detections = detect_furniture(image)
    except Exception as exc:
        logger.error(f"Inference error in /analyze: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Furniture detection failed: {exc}",
        )

    # 2. Optional Depth
    depth_vis_uri: str | None = None
    depth_map = None
    depth_result = None
    depth_warnings = []
    if req.include_depth or req.include_room:
        try:
            depth_result = estimate_depth_result(image)
            depth_map = depth_result.values
            depth_warnings = depth_result.warnings
            if req.include_depth:
                depth_colored = depth_to_visualization(depth_map)
                depth_vis_uri = encode_image(depth_colored, fmt="png")
        except Exception as exc:
            logger.warning(f"Depth estimation skipped due to error: {exc}")
            depth_warnings = ["Depth could not finish. Review floor corners and use measured dimensions instead."]

    # 3. Optional Room Geometry
    room_estimate: dict[str, Any] | None = None
    room_proposal: dict[str, Any] | None = None
    if req.include_room:
        try:
            furniture_boxes = [[item.box.x1, item.box.y1, item.box.x2 - item.box.x1,
                                item.box.y2 - item.box.y1] for item in detections]
            room_proposal = reconstruct_room(
                image, depth=depth_map, depth_units=depth_result.units if depth_result else None,
                boxes=furniture_boxes, intrinsics=req.intrinsics,
            )
        except Exception:
            logger.exception("Room fitting failed; returning an unavailable proposal")
            room_proposal = unavailable_room_proposal(
                "Room fitting could not finish. Review the original photo and use measured dimensions."
            )

        try:
            room_proposal = populate_room_proposal(room_proposal, detections, depth_map)
        except Exception:
            logger.exception("Furniture projection failed; keeping the floor draft")
            room_proposal["warnings"].append("Furniture depth positions could not finish. Review the photo-based starting positions.")

        try:
            # Keep classical diagnostics for existing clients, but not the old
            # image-border fallback polygon or any relative-depth dimensions.
            room_estimate = estimate_room_boundaries(image)
            room_estimate.pop("boundary_polygon", None)
            vps = detect_vanishing_points(image)
            room_estimate["vanishing_points"] = vps
            room_estimate["reconstruction_method"] = room_proposal["method"]
            if depth_map is not None:
                room_estimate["depth_units"] = depth_result.units if depth_result else "unknown"
        except Exception as exc:
            logger.warning(f"Classical room diagnostics skipped due to error: {exc}")
            room_estimate = None

    elapsed_ms = (time.perf_counter() - start_time) * 1000.0

    return AnalyzeResponse(
        detections=detections,
        depth_map=depth_vis_uri,
        depth_raw=encode_metric_depth(depth_map) if req.include_depth and depth_result and depth_result.units=="meters" else None,
        depth_metadata={"units":depth_result.units,"minimum":float(depth_map.min()),"maximum":float(depth_map.max()),"raw_png_unit":"millimeters" if depth_result.units=="meters" else None} if depth_result else None,
        room_estimate=room_estimate,
        room_proposal=room_proposal,
        warnings=["Furniture dimensions use category defaults until measurements are entered.", *depth_warnings,
                  *(room_proposal["warnings"] if room_proposal else [])],
        model_versions={"detection":"torchvision-maskrcnn-resnet50-fpn-v2-COCO_V1", "depth":depth_result.model if depth_result else "unavailable" if req.include_depth or req.include_room else "not-requested"},
        image_dimensions={"width": w, "height": h},
        processing_time_ms=round(elapsed_ms, 2),
    )


@router.post(
    "/process",
    response_model=ProcessResponse,
    summary="Apply classical image processing operation",
    description="Demonstrates image processing concepts: CLAHE, grayscale, contrast stretching, edge detection, contour analysis, and color histograms.",
)
def process_image(req: ProcessRequest) -> ProcessResponse:
    try:
        image = decode_base64_image(req.image)
        image = normalize_orientation(image)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image: {exc}",
        )

    metadata: dict[str, Any] = {}
    result_img = image

    op = req.operation
    if op == "grayscale":
        result_img = to_grayscale(image)
    elif op == "contrast":
        factor = float(req.params.get("factor", 1.35))
        result_img = enhance_contrast(image, factor=factor)
    elif op == "clahe":
        result_img = apply_clahe(image)
    elif op == "edges":
        method = str(req.params.get("method", "canny"))
        result_img = detect_edges(image, method=method)
    elif op == "contours":
        min_area = float(req.params.get("min_area", 200.0))
        contours = extract_contours(image, min_area=min_area)
        result_img = image.copy()
        import numpy as np
        for contour in contours:
            cv2.polylines(result_img, [np.array(contour["points"], dtype=np.int32)], True, (70, 180, 100), 2)
        metadata["contour_count"] = len(contours)
    elif op == "histogram":
        metadata["histogram"] = compute_histogram(image)
        # Return CLAHE-enhanced version alongside histogram data
        result_img = apply_clahe(image)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported operation '{op}'",
        )

    uri = encode_image(result_img, fmt="png" if op in ("edges", "contours") else "jpeg")
    return ProcessResponse(uri=uri, metadata=metadata)


@router.post(
    "/inpaint",
    response_model=InpaintResponse,
    summary="Remove furniture and inpaint empty floor/wall",
    description="Erases the bounding box regions of detected furniture using Navier-Stokes or Telea inpainting algorithms and composites the result into the original image.",
)
def inpaint_room(req: InpaintRequest) -> InpaintResponse:
    try:
        image = decode_base64_image(req.image)
        image = normalize_orientation(image)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image: {exc}",
        )

    if not req.boxes and not req.masks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No boxes provided for inpainting.",
        )

    try:
        mask = reviewed_mask(image.shape, req.masks) if req.masks else create_removal_mask(image.shape, req.boxes, dilation_iterations=2)
        warnings = ["Hidden surfaces are synthesized. Preserve the original as the geometry evidence."]
        if req.prefer_lama and lama_ready():
            try:
                inpainted, method_used = lama_inpaint(image, mask)
            except Exception as exc:
                logger.warning("LaMa unavailable; bounded OpenCV fallback: %s", type(exc).__name__)
                inpainted, method_used = remove_furniture(image, mask, method=req.method)
                warnings.append("LaMa could not finish. This preview uses approximate OpenCV inpainting; review large removals carefully.")
        else:
            inpainted, method_used = remove_furniture(image, mask, method=req.method)
            warnings.append("Generative LaMa weights are unavailable. This preview uses approximate OpenCV inpainting.")
        composited = composite_result(image, inpainted, mask)
        uri = encode_image(composited, fmt="png")
        return InpaintResponse(uri=uri, method=method_used, warnings=warnings, mask_uri=encode_image(mask, fmt="png"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"Inpainting failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inpainting failed: {exc}",
        )


@router.post(
    "/depth",
    response_model=DepthResponse,
    summary="Monocular depth estimation",
    description="Estimates relative/metric depth from a single room photograph and returns a colorized depth visualization map.",
)
def compute_depth(req: DepthRequest) -> DepthResponse:
    try:
        image = decode_base64_image(req.image)
        image = normalize_orientation(image)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image: {exc}",
        )

    try:
        result = estimate_depth_result(image)
        depth = result.values
        colored = depth_to_visualization(depth)
        raw_vis_uri = encode_image(colored, fmt="png")
        return DepthResponse(depth_map=raw_vis_uri, visualization=raw_vis_uri, units=result.units, model=result.model, warnings=result.warnings, raw_depth=encode_metric_depth(depth) if result.units=="meters" else None)
    except Exception as exc:
        logger.error(f"Depth computation failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Depth estimation failed: {exc}",
        )


@router.get(
    "/health",
    summary="Health check and model status",
)
async def health_check() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "auraspace-vision-service",
        "models": {
            "mask_rcnn_loaded": is_model_loaded(),
            "depth_model_loaded": is_depth_model_loaded(),
            "lama_available": lama_ready(),
        },
    }


@router.post("/validate")
def validate_image(req: DepthRequest):
    try:
        image = decode_base64_image(req.image)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="The file is not a supported bounded image.") from exc
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    luminance = float(np.mean(gray))
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    warnings = []
    if luminance < 45:
        warnings.append("This photo is dark. A brighter viewpoint may improve detection.")
    if sharpness < 40:
        warnings.append("This photo may be blurry or low-texture. Review the result or capture another view.")
    return {"image_dimensions":{"width": image.shape[1], "height": image.shape[0]}, "quality_warnings":warnings, "quality":{"mean_luminance":luminance,"laplacian_variance":sharpness}, "orientation":"normalized"}
