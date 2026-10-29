"""Deployment provisioning contracts with tiny fixtures, never model weights."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

from app.model_assets import configure_models, file_sha256


class ModelAssetTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.manifest = self.directory / 'manifest.json'
        self.models = self.directory / 'models'
        self.models.mkdir()
        self.depth = self.models / 'depth-indoor'
        self.depth.mkdir()
        self.descriptor = {'models': [], 'metricDepth': {'directory': 'depth-indoor', 'files': []}}
        for filename in ['maskrcnn_fixture.pth', 'big-lama.pt']:
            content = filename.encode()
            (self.models / filename).write_bytes(content)
            self.descriptor['models'].append({'file': filename, 'sha256': hashlib.sha256(content).hexdigest()})
        for filename in ['config.json', 'preprocessor_config.json', 'model.safetensors']:
            content = filename.encode()
            (self.depth / filename).write_bytes(content)
            self.descriptor['metricDepth']['files'].append({'name': filename, 'sha256': hashlib.sha256(content).hexdigest()})
        self.manifest.write_text(json.dumps(self.descriptor))

    def test_all_assets_are_verified_before_setting_runtime_paths(self):
        with patch.dict(os.environ, {}, clear=True):
            configure_models(self.models, self.manifest)
            self.assertEqual(os.environ['MASKRCNN_MODEL_PATH'], str(self.models / 'maskrcnn_fixture.pth'))
            self.assertEqual(os.environ['METRIC_DEPTH_MODEL_PATH'], str(self.depth))
            self.assertEqual(os.environ['LAMA_MODEL_SHA256'], self.descriptor['models'][1]['sha256'])

    def test_missing_depth_asset_blocks_full_inference_startup_without_partial_configuration(self):
        (self.depth / 'model.safetensors').unlink()
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'missing.*model.safetensors'):
                configure_models(self.models, self.manifest)
            self.assertNotIn('MASKRCNN_MODEL_PATH', os.environ)

    def test_corrupted_asset_cannot_become_a_healthy_model_deployment(self):
        (self.models / 'big-lama.pt').write_bytes(b'corrupt')
        with self.assertRaisesRegex(RuntimeError, 'checksum.*big-lama.pt'):
            configure_models(self.models, self.manifest)

    def test_hashing_streams_large_files_instead_of_copying_checkpoints_into_ram(self):
        content = b'a' * (1024 * 1024 + 31)
        path = self.directory / 'large-file'
        path.write_bytes(content)
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('Do not allocate a checkpoint-sized byte buffer')):
            self.assertEqual(file_sha256(path), hashlib.sha256(content).hexdigest())

    def test_production_start_preserves_warmed_models_in_a_single_server_process(self):
        script = Path(__file__).resolve().parents[1] / 'scripts/start_production.py'
        spec = importlib.util.spec_from_file_location('fixture_production_start', script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        calls = Mock()
        modules = {
            'app.inference': types.SimpleNamespace(_load_model=calls.detection),
            'app.depth': types.SimpleNamespace(_load_depth_model=calls.depth),
            'app.lama': types.SimpleNamespace(_load=calls.removal),
            'uvicorn': types.SimpleNamespace(run=calls.serve),
        }
        with patch.dict(os.environ, {'MODEL_DIRECTORY': str(self.models)}, clear=True), \
                patch.dict('sys.modules', modules), patch.object(module, 'configure_models', calls.configure):
            module.main()
        self.assertEqual([call[0] for call in calls.mock_calls], ['configure', 'detection', 'depth', 'removal', 'serve'])
        self.assertEqual(calls.serve.call_args.kwargs['workers'], 1)
        self.assertEqual(calls.serve.call_args.kwargs['limit_concurrency'], 2)


if __name__ == '__main__':
    unittest.main()
