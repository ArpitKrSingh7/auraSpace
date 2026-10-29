"""Normalize OpenCV line endpoints before using them in room geometry."""
import numpy as np


def hough_segments(lines: np.ndarray | None) -> np.ndarray:
    """Return N x 4 endpoints for both N x 1 x 4 and N x 4 bindings.

    OpenCV Python builds expose the vector of four-coordinate segments with
    different singleton dimensions. Indexing ``lines[:, 0]`` loses coordinates
    on the flat layout. No detected lines may be None or an empty array.
    """
    if lines is None:
        return np.empty((0, 4), dtype=np.int32)
    return np.asarray(lines).reshape(-1, 4)
