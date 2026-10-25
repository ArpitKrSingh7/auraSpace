import unittest
from scripts.evaluate import evaluate_benchmarks
from scripts.prepare_datasets import prepare_subset


class TestEvaluation(unittest.TestCase):
    def test_no_data_means_no_measured_metrics(self):
        self.assertIsNone(evaluate_benchmarks()['metrics'])

    def test_predictions_match_each_annotation_at_most_once(self):
        annotations = {'images': [{'id': 1}], 'annotations': [{'image_id': 1, 'category_id': 62, 'bbox': [10, 10, 20, 20]}]}
        predictions = [{'image_id': 1, 'category_id': 62, 'bbox': [10, 10, 20, 20], 'score': .9}, {'image_id': 1, 'category_id': 62, 'bbox': [10, 10, 20, 20], 'score': .8}]
        result = evaluate_benchmarks(annotations, predictions)['metrics']
        self.assertEqual(result['true_positive'], 1)
        self.assertEqual(result['false_positive'], 1)
        self.assertEqual(result['precision'], .5)
        self.assertEqual(result['recall'], 1)

    def test_subset_uses_real_ids_and_retains_licenses(self):
        source = {'images': [{'id': 5}, {'id': 7}], 'annotations': [{'image_id': 5, 'category_id': 62}, {'image_id': 7, 'category_id': 1}], 'categories': [{'id': 62}, {'id': 1}], 'licenses': [{'id': 1}]}
        result = prepare_subset(source)
        self.assertEqual(result['images'], [{'id': 5}])
        self.assertEqual(result['licenses'], [{'id': 1}])
