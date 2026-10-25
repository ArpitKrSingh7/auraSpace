"""
Furniture Removal / Inpainting
===============================

**Image Processing concepts demonstrated:**

1. **Image inpainting** — reconstructing missing or removed regions of an
   image from surrounding pixel information.  Two classic approaches:

   * **Telea (2004):** Fast marching method that propagates pixel values
     inward from the boundary using a weighted average of known neighbours.
     Efficient and artefact-free for small holes.

   * **Navier-Stokes (Bertalmio 2001):** Models the image intensity as a
     fluid and solves the Navier-Stokes equations to propagate isophote
     (equal-intensity) lines into the unknown region.  Better at preserving
     linear structures (e.g. wall edges, floor tile lines).

2. **Mask dilation** — expanding the removal mask by a configurable margin
   so that the inpainting algorithm has enough context to seamlessly blend.

3. **Alpha compositing** — blending the inpainted result back into the
   original image *only* in the masked region, preserving untouched areas.
"""

from __future__ import annotations

import logging
from typing import Literal

import cv2
import numpy as np

from app.config import INPAINT_MASK_DILATION, INPAINT_RADIUS
from app.preprocessing import apply_morphology

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Mask creation
# ---------------------------------------------------------------------------

def create_removal_mask(
    image_shape: tuple[int, ...],
    boxes: list[list[float]],
    dilation: int | None = None,
    dilation_iterations: int = 1,
) -> np.ndarray:
    """Create a binary mask from bounding boxes with optional dilation.

    **Image Processing concept — Binary mask construction & dilation:**
    Each bounding box is filled as a white rectangle on a black canvas.  The
    mask is then dilated with an elliptical structuring element so that the
    inpainting algorithm can sample sufficient context outside the object
    boundary — this avoids leaving visible seams.

    Parameters
    ----------
    image_shape : tuple
        (H, W) or (H, W, C) of the target image.
    boxes : list[list[float]]
        List of [x, y, width, height] bounding boxes in source pixels.
    dilation : int | None
        Dilation kernel size.  Defaults to ``INPAINT_MASK_DILATION``.

    Returns
    -------
    np.ndarray
        HxW uint8 mask (0 = keep, 255 = remove).
    """
    h, w = image_shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)

    for box in boxes:
        if len(box) != 4 or not np.isfinite(box).all():
            raise ValueError("Each box must have four finite coordinates")
        x, y, width, height = box
        if width <= 0 or height <= 0:
            raise ValueError("Box width and height must be positive")
        x1, y1 = max(0, int(np.floor(x))), max(0, int(np.floor(y)))
        x2, y2 = min(w, int(np.ceil(x + width))), min(h, int(np.ceil(y + height)))
        if x2 > x1 and y2 > y1:
            mask[y1:y2, x1:x2] = 255

    dilation = INPAINT_MASK_DILATION if dilation is None else dilation
    if dilation > 0 and dilation_iterations > 0:
        mask = apply_morphology(mask, operation="dilate", kernel_size=dilation, iterations=dilation_iterations)

    return mask


# ---------------------------------------------------------------------------
# Inpainting methods
# ---------------------------------------------------------------------------

def _inpaint_telea(
    image: np.ndarray, mask: np.ndarray, radius: int
) -> np.ndarray:
    """Telea fast-marching inpainting.

    **Image Processing concept — Fast Marching Method (FMM):**
    Pixels on the boundary of the unknown region are filled first by taking
    a weighted average of known neighbours.  The boundary then advances
    inward (fast-marching), iteratively filling the hole from outside-in.
    Weights decay with distance and angular deviation from the local gradient,
    so linear structures are propagated smoothly.
    """
    return cv2.inpaint(image, mask, radius, cv2.INPAINT_TELEA)


def _inpaint_ns(
    image: np.ndarray, mask: np.ndarray, radius: int
) -> np.ndarray:
    """Navier-Stokes (Bertalmio) inpainting.

    **Image Processing concept — PDE-based inpainting:**
    The algorithm iterates between:
    1. Propagating the image Laplacian along the isophote direction (the
       level-set lines of equal intensity), and
    2. Diffusing the result with an anisotropic diffusion step.
    This mimics how a painter would continue existing brush strokes into the
    hole, making it superior for images with strong directional structure
    (e.g. wood grain, wall textures).
    """
    return cv2.inpaint(image, mask, radius, cv2.INPAINT_NS)


def _inpaint_directional(
    image: np.ndarray, mask: np.ndarray
) -> np.ndarray:
    """Enhanced directional interpolation using surrounding context sampling.

    **Image Processing concept — Context-aware interpolation:**
    For each masked pixel we sample in 8 directions (N, NE, E, SE, S, SW, W,
    NW) until hitting a known pixel.  The unknown pixel is set to a
    distance-weighted average of these samples.  This is effectively a custom
    radial-basis interpolation that respects image structure better than a
    uniform blur.

    This method is heavier than Telea/NS but can handle larger holes.

    Parameters
    ----------
    image : np.ndarray
        BGR image.
    mask : np.ndarray
        Binary mask (255 = remove).

    Returns
    -------
    np.ndarray
        Inpainted image.
    """
    result = image.copy()
    h, w = mask.shape[:2]

    # Directions: (dy, dx)
    directions = [(-1, 0), (-1, 1), (0, 1), (1, 1),
                  (1, 0), (1, -1), (0, -1), (-1, -1)]
    max_reach = max(h, w) // 4  # limit search distance

    # Find masked pixel coordinates
    ys, xs = np.where(mask > 0)

    for py, px in zip(ys, xs):
        samples = []
        weights = []
        for dy, dx in directions:
            cy, cx = py, px
            dist = 0
            found = False
            while dist < max_reach:
                cy += dy
                cx += dx
                dist += 1
                if cy < 0 or cy >= h or cx < 0 or cx >= w:
                    break
                if mask[cy, cx] == 0:
                    samples.append(image[cy, cx].astype(np.float64))
                    weights.append(1.0 / (dist + 1e-6))
                    found = True
                    break
            # If we didn't find a valid pixel, skip this direction

        if samples:
            w_arr = np.array(weights)
            w_arr /= w_arr.sum()
            colour = np.zeros(3, dtype=np.float64)
            for s, wt in zip(samples, w_arr):
                colour += s * wt
            result[py, px] = np.clip(colour, 0, 255).astype(np.uint8)

    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def remove_furniture(
    image: np.ndarray,
    mask: np.ndarray,
    method: str = "auto",
    radius: int | None = None,
) -> tuple[np.ndarray, str]:
    """Remove furniture from an image by inpainting masked regions.

    Parameters
    ----------
    image : np.ndarray
        HxWx3 BGR image.
    mask : np.ndarray
        HxW uint8 mask (255 = region to remove).
    method : str
        ``'telea'``, ``'navier-stokes'``, ``'directional'``, or ``'auto'``.
    radius : int | None
        Inpainting radius for Telea / NS.  Defaults to ``INPAINT_RADIUS``.

    Returns
    -------
    tuple[np.ndarray, str]
        (inpainted_image, method_used)
    """
    radius = radius or INPAINT_RADIUS
    if mask.shape[:2] != image.shape[:2]:
        raise ValueError("Mask and image dimensions must match")

    # Ensure mask is single-channel
    if len(mask.shape) == 3:
        mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)

    mask_area = int(np.sum(mask > 0))
    total_area = mask.shape[0] * mask.shape[1]
    mask_ratio = mask_area / total_area if total_area > 0 else 0
    if mask_area == 0 or mask_area == total_area:
        raise ValueError("Select part of the image and leave surrounding surfaces visible")

    logger.info(
        "Inpainting request: method=%s, mask_pixels=%d (%.1f%% of image)",
        method, mask_area, mask_ratio * 100,
    )

    if method == "auto":
        # Heuristic: use NS for small regions (< 5 % of image), Telea for
        # medium, and directional for very large removals.
        if mask_ratio < 0.05:
            method = "navier-stokes"
        elif mask_ratio < 0.20:
            method = "telea"
        else:
            method = "telea"  # directional is slow; default to Telea for safety

    if method == "navier-stokes":
        result = _inpaint_ns(image, mask, radius)
    elif method == "directional":
        result = _inpaint_directional(image, mask)
    else:
        method = "telea"
        result = _inpaint_telea(image, mask, radius)

    return result, method


def composite_result(
    original: np.ndarray,
    result: np.ndarray,
    mask: np.ndarray,
) -> np.ndarray:
    """Blend the inpainted result into the original only in masked regions.

    **Computer Graphics concept — Alpha compositing:**
    We use the mask as a binary alpha channel:
        ``output = mask · result + (1 - mask) · original``
    This ensures pixels outside the removal region are pixel-identical to the
    input, avoiding any unintended artefacts.

    Parameters
    ----------
    original : np.ndarray
        Original BGR image.
    result : np.ndarray
        Inpainted BGR image.
    mask : np.ndarray
        HxW uint8 mask.

    Returns
    -------
    np.ndarray
        Composited BGR image.
    """
    if len(mask.shape) == 2:
        alpha = (mask > 0).astype(np.float32)[:, :, np.newaxis]
    else:
        alpha = (mask[:, :, 0] > 0).astype(np.float32)[:, :, np.newaxis]

    composited = (alpha * result.astype(np.float32)
                  + (1.0 - alpha) * original.astype(np.float32))
    return composited.astype(np.uint8)
