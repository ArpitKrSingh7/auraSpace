"""
AuraSpace — Vision Service
====================================
AI-powered room layout analysis and furniture visualization backend.

This package provides:
  - Image preprocessing (OpenCV-based pipeline)
  - Furniture detection (COCO-pretrained Mask R-CNN)
  - Monocular depth estimation
  - Furniture removal / inpainting
  - Room geometry analysis (vanishing points, floor plane)

All image I/O uses base64 data URIs for JSON transport.
"""

__version__ = "1.0.0"
