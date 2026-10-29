"""Hosted entrypoint with build-provisioned, checksum-verified model assets."""
import os
from pathlib import Path
from app.model_assets import configure_models

# Vercel runs the pyproject build script before packaging this directory.
# Fail startup if provisioning was incomplete, rather than serving heuristic
# depth from an apparently successful full-inference deployment.
configure_models(Path(os.getenv('MODEL_DIRECTORY', str(Path(__file__).parent / 'models'))))
os.environ.setdefault('TORCH_DEVICE', 'cpu')
os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('MKL_NUM_THREADS', '2')
os.environ.setdefault('TORCH_HOME', '/tmp/auraspace-torch')
os.environ.setdefault('HF_HOME', '/tmp/auraspace-huggingface')

from app.main import app
__all__ = ["app"]
