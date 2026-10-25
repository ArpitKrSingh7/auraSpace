#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export LAMA_MODEL_PATH="$PWD/.artifacts/models/big-lama.pt"
export LAMA_MODEL_SHA256=344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9
export MASKRCNN_MODEL_PATH="$PWD/.artifacts/models/maskrcnn_resnet50_fpn_v2_coco-73cbd019.pth"
export MASKRCNN_MODEL_SHA256=73cbd0190fcbe3ba339921fbce2c3a0b6bb9126c9a133c85e43a2a8e060a109e
if [ -d "$PWD/.artifacts/models/depth-anything-v2-metric-indoor-small" ]; then
 export METRIC_DEPTH_MODEL_PATH="$PWD/.artifacts/models/depth-anything-v2-metric-indoor-small"
fi
export OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 TORCH_DEVICE=cpu PYTHONPATH=services/vision
AURASPACE_PYTHON=${AURASPACE_PYTHON:-python3}
if [ -x .artifacts/vision-venv/bin/python ]; then AURASPACE_PYTHON=.artifacts/vision-venv/bin/python; fi
exec "$AURASPACE_PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
