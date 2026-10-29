"""Full-inference container startup; downloads happen in a separate init task."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.model_assets import configure_models


def main():
    os.environ.setdefault('TORCH_DEVICE', 'cpu')
    os.environ.setdefault('OMP_NUM_THREADS', '2')
    os.environ.setdefault('MKL_NUM_THREADS', '2')
    configure_models(Path(os.getenv('MODEL_DIRECTORY', '/models')))
    if os.getenv('PRELOAD_VISION_MODELS', 'true').lower() == 'true':
        # One process keeps the loaded models; do not exec a new process after
        # warming them or create multiple Uvicorn workers that duplicate RAM.
        from app.inference import _load_model
        from app.depth import _load_depth_model
        from app.lama import _load
        _load_model()
        _load_depth_model()
        _load()
    import uvicorn
    uvicorn.run('app.main:app', host='0.0.0.0', port=int(os.getenv('PORT', '8000')),
                workers=1, limit_concurrency=2)


if __name__ == '__main__':
    main()
