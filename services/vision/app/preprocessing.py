"""
Image Preprocessing — OpenCV-based image processing pipeline
=============================================================

**Image Processing concepts demonstrated:**

1. **Colour-space conversion** (BGR → Gray, BGR → LAB) for feature extraction.
2. **Histogram equalisation** (CLAHE) to improve contrast in under-/over-exposed
   photographs — a key pre-step before edge or contour analysis.
3. **Edge detection** using both Sobel (gradient-magnitude) and Canny
   (non-maximum suppression + hysteresis thresholding).
4. **Morphological operations** (dilation, erosion, opening, closing) for
   cleaning binary masks.
5. **Contour extraction** with area filtering for shape analysis.
6. **Histogram computation** for colour distribution analysis.

All functions operate on NumPy arrays (OpenCV's native representation) and
are stateless — no class instances required.
"""

from __future__ import annotations

import base64
import io
import logging
import re
from typing import Any

import cv2
import numpy as np
from PIL import Image, ExifTags

from app.config import CLAHE_CLIP_LIMIT, CLAHE_TILE_SIZE, MAX_IMAGE_DIM

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Base64 encode / decode helpers
# ---------------------------------------------------------------------------

def decode_base64_image(data_uri: str) -> np.ndarray:
    """Decode a base64 data-URI (or raw base64 string) into a BGR NumPy array.

    **Image Processing concept — Raster image decoding:**
    JPEG / PNG bytes are decompressed into a 3-channel (BGR) or 4-channel
    (BGRA) uint8 matrix that OpenCV can manipulate directly.

    Parameters
    ----------
    data_uri : str
        Either ``data:image/<fmt>;base64,<payload>`` or a raw base64 string.

    Returns
    -------
    np.ndarray
        HxWx3 BGR uint8 image.

    Raises
    ------
    ValueError
        If the string cannot be decoded into a valid image.
    """
    # Strip the data-URI prefix if present
    if "," in data_uri:
        data_uri = data_uri.split(",", 1)[1]

    # Remove any whitespace / newlines
    data_uri = re.sub(r"\s+", "", data_uri)

    try:
        raw_bytes = base64.b64decode(data_uri)
    except Exception as exc:
        raise ValueError(f"Invalid base64 payload: {exc}") from exc

    arr = np.frombuffer(raw_bytes, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image from provided base64 data")

    # Resize if too large — keeps memory / inference time bounded
    h, w = image.shape[:2]
    if max(h, w) > MAX_IMAGE_DIM:
        scale = MAX_IMAGE_DIM / max(h, w)
        image = cv2.resize(
            image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA
        )
        logger.debug("Resized image from %dx%d → %dx%d", w, h, image.shape[1], image.shape[0])

    return image


def encode_image(image: np.ndarray, fmt: str = "jpeg", quality: int = 85) -> str:
    """Encode a BGR NumPy array into a base64 data URI.

    Parameters
    ----------
    image : np.ndarray
        HxWxC BGR image.
    fmt : str
        Output format — ``'jpeg'`` or ``'png'``.
    quality : int
        JPEG quality (1–100).

    Returns
    -------
    str
        ``data:image/<fmt>;base64,<payload>``
    """
    if fmt.lower() in ("jpg", "jpeg"):
        ext = ".jpg"
        params = [cv2.IMWRITE_JPEG_QUALITY, quality]
        mime = "jpeg"
    else:
        ext = ".png"
        params = [cv2.IMWRITE_PNG_COMPRESSION, 3]
        mime = "png"

    success, buf = cv2.imencode(ext, image, params)
    if not success:
        raise RuntimeError("cv2.imencode failed")

    b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    return f"data:image/{mime};base64,{b64}"


# ---------------------------------------------------------------------------
# Orientation correction
# ---------------------------------------------------------------------------

def normalize_orientation(image: np.ndarray) -> np.ndarray:
    """Fix EXIF orientation by re-encoding through Pillow.

    **Image Processing concept — Geometric transformation:**
    EXIF orientation tags indicate how the sensor was rotated when the photo
    was captured.  Applying the correct rotation / flip ensures that
    downstream processing (edge detection, object detection) sees the image
    as a human would.

    Parameters
    ----------
    image : np.ndarray
        BGR image that *might* have wrong orientation.

    Returns
    -------
    np.ndarray
        BGR image with orientation normalised.
    """
    # Convert BGR → RGB for Pillow
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(rgb)

    try:
        exif = pil_img._getexif()
        if exif:
            orientation_key = next(
                (k for k, v in ExifTags.TAGS.items() if v == "Orientation"), None
            )
            if orientation_key and orientation_key in exif:
                orient = exif[orientation_key]
                rotations = {3: 180, 6: 270, 8: 90}
                if orient in rotations:
                    pil_img = pil_img.rotate(rotations[orient], expand=True)
    except Exception:
        pass  # No EXIF or unsupported — return as-is

    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)


# ---------------------------------------------------------------------------
# Contrast-Limited Adaptive Histogram Equalisation (CLAHE)
# ---------------------------------------------------------------------------

def apply_clahe(image: np.ndarray) -> np.ndarray:
    """Apply CLAHE to the luminance channel of a colour image.

    **Image Processing concept — Histogram equalisation:**
    Standard histogram equalisation redistributes pixel intensities to span
    the full 0–255 range, but can amplify noise.  CLAHE divides the image
    into tiles and equalises each independently, limiting contrast
    amplification to ``clip_limit``.  This produces locally-enhanced contrast
    without blowing out highlights.

    We operate in **CIE L*a*b*** colour space so that only the lightness
    channel is modified, preserving the original chromaticity.

    Parameters
    ----------
    image : np.ndarray
        BGR uint8 image.

    Returns
    -------
    np.ndarray
        CLAHE-enhanced BGR image.
    """
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    clahe = cv2.createCLAHE(
        clipLimit=CLAHE_CLIP_LIMIT,
        tileGridSize=(CLAHE_TILE_SIZE, CLAHE_TILE_SIZE),
    )
    l_channel = clahe.apply(l_channel)

    lab = cv2.merge([l_channel, a_channel, b_channel])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


# ---------------------------------------------------------------------------
# Grayscale conversion
# ---------------------------------------------------------------------------

def to_grayscale(image: np.ndarray) -> np.ndarray:
    """Convert a BGR image to single-channel grayscale.

    **Image Processing concept — Luminance extraction:**
    OpenCV's ``cvtColor`` uses the BT.601 luma formula:
        Y = 0.299·R + 0.587·G + 0.114·B
    This perceptual weighting reflects human sensitivity to green light.

    Parameters
    ----------
    image : np.ndarray
        BGR image.

    Returns
    -------
    np.ndarray
        HxW uint8 grayscale image.
    """
    if len(image.shape) == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


# ---------------------------------------------------------------------------
# Contrast enhancement (linear scaling)
# ---------------------------------------------------------------------------

def enhance_contrast(image: np.ndarray, factor: float = 1.35) -> np.ndarray:
    """Linearly scale pixel intensities around the mean to increase contrast.

    **Image Processing concept — Point operation / intensity transformation:**
    Each pixel ``p`` is mapped to ``mean + factor * (p - mean)`` and clipped
    to [0, 255].  A factor > 1 spreads intensities away from the mean,
    increasing perceived contrast; < 1 compresses them.

    Parameters
    ----------
    image : np.ndarray
        BGR or grayscale image.
    factor : float
        Contrast multiplier (> 1 = more contrast).

    Returns
    -------
    np.ndarray
        Contrast-enhanced image.
    """
    mean = np.mean(image)
    result = mean + factor * (image.astype(np.float32) - mean)
    return np.clip(result, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# Edge detection
# ---------------------------------------------------------------------------

def detect_edges(image: np.ndarray, method: str = "canny") -> np.ndarray:
    """Detect edges using Sobel gradient magnitude or Canny edge detector.

    **Image Processing / Computer Vision concept — Edge detection:**

    * **Sobel** computes first-order finite-difference approximations of the
      image gradient in X and Y, then combines them as
      ``sqrt(Gx² + Gy²)``.  This highlights regions of rapid intensity change
      (i.e. edges).

    * **Canny** extends Sobel with:
      1. Gaussian smoothing to reduce noise,
      2. Non-maximum suppression to thin edges to single-pixel width,
      3. Hysteresis thresholding with two thresholds to suppress weak,
         isolated edges while preserving connected ones.

    Parameters
    ----------
    image : np.ndarray
        BGR or grayscale image.
    method : str
        ``'canny'`` (default) or ``'sobel'``.

    Returns
    -------
    np.ndarray
        HxW uint8 edge map (0 or 255 for Canny; gradient magnitude for Sobel).
    """
    gray = to_grayscale(image) if len(image.shape) == 3 else image

    if method.lower() == "sobel":
        # Sobel gradient in X and Y directions (kernel size 3)
        gx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        magnitude = np.sqrt(gx ** 2 + gy ** 2)
        # Normalise to uint8
        magnitude = cv2.normalize(magnitude, None, 0, 255, cv2.NORM_MINMAX)
        return magnitude.astype(np.uint8)
    else:
        # Gaussian blur to suppress noise before Canny
        blurred = cv2.GaussianBlur(gray, (5, 5), sigmaX=1.4)
        # Automatic thresholding using Otsu's method on intensity statistics
        median_val = float(np.median(blurred))
        lo = int(max(0, 0.66 * median_val))
        hi = int(min(255, 1.33 * median_val))
        return cv2.Canny(blurred, lo, hi)


# ---------------------------------------------------------------------------
# Contour extraction
# ---------------------------------------------------------------------------

def extract_contours(
    image: np.ndarray,
    min_area: float = 500.0,
    max_contours: int = 50,
) -> list[dict[str, Any]]:
    """Extract external contours with area filtering.

    **Computer Vision concept — Contour analysis:**
    After binarising the image (via Canny edges + dilation), ``findContours``
    traces connected boundary pixels.  Each contour is a polyline that can
    be further analysed for shape, area, or bounding geometry.

    Parameters
    ----------
    image : np.ndarray
        BGR or grayscale image.
    min_area : float
        Minimum contour area in pixels to keep.
    max_contours : int
        Maximum number of contours to return (sorted by area, largest first).

    Returns
    -------
    list[dict]
        Each dict contains ``'points'``, ``'area'``, and ``'bounding_box'``.
    """
    edges = detect_edges(image, method="canny")

    # Dilate edges to close small gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dilated = cv2.dilate(edges, kernel, iterations=1)

    contours, _ = cv2.findContours(
        dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    results: list[dict[str, Any]] = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        # Approximate the contour to reduce vertex count
        epsilon = 0.01 * cv2.arcLength(cnt, closed=True)
        approx = cv2.approxPolyDP(cnt, epsilon, closed=True)
        x, y, w, h = cv2.boundingRect(cnt)
        results.append(
            {
                "points": approx.reshape(-1, 2).tolist(),
                "area": float(area),
                "bounding_box": [float(x), float(y), float(x + w), float(y + h)],
            }
        )

    # Sort by area descending and limit
    results.sort(key=lambda c: c["area"], reverse=True)
    return results[:max_contours]


# ---------------------------------------------------------------------------
# Colour histogram
# ---------------------------------------------------------------------------

def compute_histogram(image: np.ndarray) -> dict[str, Any]:
    """Compute per-channel colour histograms.

    **Image Processing concept — Histogram analysis:**
    A histogram counts how many pixels fall into each intensity bin.  It
    reveals the tonal distribution and is essential for tasks such as
    thresholding, white-balance correction, and exposure analysis.

    Parameters
    ----------
    image : np.ndarray
        BGR image.

    Returns
    -------
    dict
        ``{'bins': list[int], 'blue': list, 'green': list, 'red': list}``
    """
    bins = list(range(256))
    result: dict[str, Any] = {"bins": bins}

    if len(image.shape) == 2:
        # Grayscale
        hist = cv2.calcHist([image], [0], None, [256], [0, 256])
        result["gray"] = hist.flatten().tolist()
    else:
        colours = ("blue", "green", "red")
        for i, colour in enumerate(colours):
            hist = cv2.calcHist([image], [i], None, [256], [0, 256])
            result[colour] = hist.flatten().tolist()

    return result


# ---------------------------------------------------------------------------
# Morphological operations on masks
# ---------------------------------------------------------------------------

def apply_morphology(
    mask: np.ndarray,
    operation: str = "close",
    kernel_size: int = 5,
    iterations: int = 2,
) -> np.ndarray:
    """Apply a morphological operation to a binary mask.

    **Image Processing concept — Mathematical morphology:**

    * **Erosion** shrinks white regions — removes small noise blobs.
    * **Dilation** expands white regions — fills small holes.
    * **Opening** (erode → dilate) removes small foreground noise.
    * **Closing** (dilate → erode) fills small holes in the foreground.

    These are foundational operations in binary image analysis and are used
    here to clean up instance segmentation masks before inpainting.

    Parameters
    ----------
    mask : np.ndarray
        Binary mask (0/255 uint8).
    operation : str
        One of ``'erode'``, ``'dilate'``, ``'open'``, ``'close'``.
    kernel_size : int
        Size of the structuring element.
    iterations : int
        Number of times the operation is applied.

    Returns
    -------
    np.ndarray
        Processed binary mask.
    """
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (kernel_size, kernel_size)
    )
    ops = {
        "erode": cv2.MORPH_ERODE,
        "dilate": cv2.MORPH_DILATE,
        "open": cv2.MORPH_OPEN,
        "close": cv2.MORPH_CLOSE,
    }
    morph_op = ops.get(operation.lower(), cv2.MORPH_CLOSE)
    return cv2.morphologyEx(mask, morph_op, kernel, iterations=iterations)
