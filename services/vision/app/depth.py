"""
Monocular Depth Estimation
===========================

**Computer Vision / Computer Graphics concepts demonstrated:**

1. **Monocular depth estimation** — predicting per-pixel depth from a single
   RGB image.  This is an ill-posed inverse problem solved via deep learning;
   the network learns structural priors (perspective, occlusion, texture
   gradients) from large-scale training data.

2. **Depth-map normalisation** — raw MiDaS output is in inverse relative
   depth; we normalise to [0, 255] for visualisation.

3. **Colour-map visualisation** — applying OpenCV's ``COLORMAP_MAGMA`` to a
   grayscale depth map produces an intuitive heat-map where warm colours
   indicate nearby surfaces and cool colours indicate far ones.

4. **Gradient-based depth fallback** — when model loading is impractical
   (e.g. Vercel serverless), we estimate *approximate* depth from image
   gradient magnitude, exploiting the texture-gradient depth cue (closer
   objects tend to show finer texture with steeper gradients).

The model is lazily loaded on first use.
"""

from __future__ import annotations

import logging
import time

import cv2
import numpy as np
import torch
from torchvision import transforms

from app.config import DEPTH_MODEL_TYPE, DEVICE, LIGHTWEIGHT_MODE

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy model singleton
# ---------------------------------------------------------------------------
_depth_model: torch.nn.Module | None = None
_depth_transform: transforms.Compose | None = None


def _load_depth_model() -> tuple[torch.nn.Module, transforms.Compose]:
    """Load Intel MiDaS for monocular depth estimation.

    **Computer Vision concept — Transfer learning for dense prediction:**
    MiDaS is trained on a mixture of depth datasets (MegaDepth, ReDWeb, DIML,
    Movies, …) using a scale-and-shift-invariant loss, which makes it robust
    across diverse scenes without per-dataset calibration.
    """
    global _depth_model, _depth_transform
    if _depth_model is not None and _depth_transform is not None:
        return _depth_model, _depth_transform

    logger.info("Loading MiDaS depth model (%s) on %s …", DEPTH_MODEL_TYPE, DEVICE)
    t0 = time.perf_counter()

    model = torch.hub.load("intel-isl/MiDaS", DEPTH_MODEL_TYPE, trust_repo=True)
    model.eval()
    model.to(DEVICE)

    # Use the small transform for MiDaS_small, otherwise DPT transform
    midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms", trust_repo=True)
    if DEPTH_MODEL_TYPE == "MiDaS_small":
        transform = midas_transforms.small_transform
    else:
        transform = midas_transforms.dpt_transform

    elapsed = time.perf_counter() - t0
    logger.info("MiDaS loaded in %.1f s", elapsed)

    _depth_model = model
    _depth_transform = transform
    return _depth_model, _depth_transform


def is_depth_model_loaded() -> bool:
    """Check whether the depth model is loaded."""
    return _depth_model is not None


# ---------------------------------------------------------------------------
# Gradient-based fallback (lightweight / Vercel mode)
# ---------------------------------------------------------------------------

def _gradient_depth(image: np.ndarray) -> np.ndarray:
    """Estimate approximate depth from image gradient magnitude.

    **Image Processing concept — Gradient-based depth cue:**
    Objects closer to the camera tend to exhibit higher-frequency texture
    (steeper gradients) because of perspective foreshortening.  While this is
    a very rough heuristic, it provides a plausible depth-like map without
    any neural network.

    We also add a vertical gradient prior: in most interior photographs the
    floor is at the bottom (closer) and the ceiling is at the top (farther).
    The two cues are linearly combined.

    Parameters
    ----------
    image : np.ndarray
        BGR image.

    Returns
    -------
    np.ndarray
        HxW float32 normalised depth map in [0, 1].
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    gradient_mag = np.sqrt(gx ** 2 + gy ** 2)

    # Smooth heavily to get a coarse depth signal
    gradient_mag = cv2.GaussianBlur(gradient_mag, (31, 31), sigmaX=10)

    # Normalise
    gmin, gmax = gradient_mag.min(), gradient_mag.max()
    if gmax - gmin > 1e-6:
        gradient_mag = (gradient_mag - gmin) / (gmax - gmin)
    else:
        gradient_mag = np.zeros_like(gradient_mag)

    # Vertical prior: linearly increasing depth from bottom to top
    h = image.shape[0]
    vert = np.linspace(0, 1, h, dtype=np.float32)[:, np.newaxis]
    vert = np.broadcast_to(vert, gradient_mag.shape).copy()

    # Combine: 40 % gradient + 60 % vertical prior
    depth = 0.4 * gradient_mag + 0.6 * vert
    return depth.astype(np.float32)


# ---------------------------------------------------------------------------
# Main entry points
# ---------------------------------------------------------------------------

@torch.no_grad()
def estimate_depth(image: np.ndarray) -> np.ndarray:
    """Estimate per-pixel depth from a single RGB image.

    **Computer Vision concept — Monocular depth estimation:**
    Given a single photograph, the model predicts *relative* inverse depth
    for every pixel.  The output is normalised to [0, 1] where 1 = closest.

    Falls back to gradient-based heuristic if ``LIGHTWEIGHT_MODE`` is enabled
    or the model fails to load.

    Parameters
    ----------
    image : np.ndarray
        HxWx3 BGR image.

    Returns
    -------
    np.ndarray
        HxW float32 depth map normalised to [0, 1].
    """
    if LIGHTWEIGHT_MODE:
        logger.info("Lightweight mode — using gradient-based depth fallback")
        return _gradient_depth(image)

    try:
        model, transform = _load_depth_model()
    except Exception as exc:
        logger.warning("Depth model load failed (%s), falling back to gradient method", exc)
        return _gradient_depth(image)

    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    input_batch = transform(rgb).to(DEVICE)

    t0 = time.perf_counter()
    prediction = model(input_batch)
    logger.debug("Depth inference: %.0f ms", (time.perf_counter() - t0) * 1000)

    # Resize prediction to original image size
    prediction = torch.nn.functional.interpolate(
        prediction.unsqueeze(1),
        size=image.shape[:2],
        mode="bicubic",
        align_corners=False,
    ).squeeze()

    depth = prediction.cpu().numpy()

    # Normalise to [0, 1] — MiDaS outputs inverse relative depth
    dmin, dmax = depth.min(), depth.max()
    if dmax - dmin > 1e-6:
        depth = (depth - dmin) / (dmax - dmin)
    else:
        depth = np.zeros_like(depth)

    return depth.astype(np.float32)


def depth_to_visualization(depth: np.ndarray) -> np.ndarray:
    """Convert a normalised depth map to a colourised BGR visualisation.

    **Computer Graphics concept — Pseudo-colour mapping:**
    Mapping a scalar field (depth) to a colour palette lets humans quickly
    interpret the 3-D structure of a scene.  We use ``COLORMAP_MAGMA`` —
    a perceptually uniform sequential palette.

    Parameters
    ----------
    depth : np.ndarray
        HxW float32 depth in [0, 1].

    Returns
    -------
    np.ndarray
        HxWx3 BGR uint8 colourised depth image.
    """
    depth_uint8 = (depth * 255).clip(0, 255).astype(np.uint8)
    return cv2.applyColorMap(depth_uint8, cv2.COLORMAP_MAGMA)
