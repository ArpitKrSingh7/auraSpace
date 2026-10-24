"""
Morrow Vision API — Main FastAPI Application
=============================================
Provides microservice endpoints for Image Processing, Computer Vision,
and Depth Analysis for Morrow Room Studio.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import LOG_LEVEL
from app.routes import router

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("morrow_vision")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Morrow Vision Service starting up...")
    yield
    logger.info("Morrow Vision Service shutting down...")


app = FastAPI(
    title="Morrow Room Studio Vision API",
    description=(
        "Academic and production CV/IP service: provides Mask R-CNN furniture instance segmentation, "
        "monocular depth estimation, Navier-Stokes / Telea inpainting for furniture removal, "
        "and classical image processing pipelines (CLAHE, Sobel/Canny edges, contours)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for Next.js web application and local mobile testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(f"Unhandled error handling {request.method} {request.url}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "An internal server error occurred.", "detail": str(exc)},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
