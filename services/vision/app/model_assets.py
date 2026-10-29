"""Provisioning checks shared by hosted entrypoints; no model imports here."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def configure_models(directory: Path, manifest_path: Path | None = None) -> None:
    """Verify all pinned assets before exposing a full-inference deployment.

    Paths come from the operator's model directory and the checked-in manifest,
    never from a photo request. Set environment only after every check passes.
    """
    manifest_path = manifest_path or Path(__file__).resolve().parents[1] / 'model-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    directory = directory.resolve()
    expected = [(directory / model['file'], model['sha256']) for model in manifest['models']]
    depth = manifest['metricDepth']
    depth_directory = directory / depth['directory']
    expected.extend((depth_directory / entry['name'], entry['sha256']) for entry in depth['files'])
    for path, checksum in expected:
        if not path.is_file():
            raise RuntimeError(f'Required model asset is missing: {path.name}. Provision the pinned models before starting vision.')
        if file_sha256(path) != checksum:
            raise RuntimeError(f'Model asset checksum does not match the pinned manifest: {path.name}.')
    detection = next(model for model in manifest['models'] if model['file'].startswith('maskrcnn_'))
    lama = next(model for model in manifest['models'] if model['file'] == 'big-lama.pt')
    os.environ.update({
        'MASKRCNN_MODEL_PATH': str(directory / detection['file']),
        'MASKRCNN_MODEL_SHA256': detection['sha256'],
        'LAMA_MODEL_PATH': str(directory / lama['file']),
        'LAMA_MODEL_SHA256': lama['sha256'],
        'METRIC_DEPTH_MODEL_PATH': str(depth_directory),
    })
