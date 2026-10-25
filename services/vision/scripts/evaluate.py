#!/usr/bin/env python3
"""Evaluate saved COCO-format predictions against annotations at a fixed IoU.

No checkpoint is run and no metrics are invented when inputs are absent.
This reports matched-box precision/recall, not COCO mAP or depth accuracy.
"""
import argparse
import json
from pathlib import Path


def compute_box_iou(boxA, boxB):
    left, top = max(boxA[0], boxB[0]), max(boxA[1], boxB[1])
    right = min(boxA[0] + boxA[2], boxB[0] + boxB[2])
    bottom = min(boxA[1] + boxA[3], boxB[1] + boxB[3])
    intersection = max(0, right - left) * max(0, bottom - top)
    union = boxA[2] * boxA[3] + boxB[2] * boxB[3] - intersection
    return intersection / union if union > 0 else 0.0


def evaluate_benchmarks(annotations=None, predictions=None, threshold=0.5):
    if annotations is None or predictions is None:
        return {"status": "not_evaluated", "metrics": None, "reason": "Provide real COCO annotations and saved model predictions. Previous hardcoded benchmark values were not measured and have been removed."}
    furniture = {62, 63, 64, 65, 67}
    image_ids = {image['id'] for image in annotations['images']}
    truth = [a for a in annotations['annotations'] if a['image_id'] in image_ids and a['category_id'] in furniture and not a.get('iscrowd')]
    guessed = sorted([p for p in predictions if p['image_id'] in image_ids and p['category_id'] in furniture], key=lambda p: p['score'], reverse=True)
    matched = set()
    true_positive = 0
    for prediction in guessed:
        candidates = [(compute_box_iou(prediction['bbox'], actual['bbox']), i) for i, actual in enumerate(truth) if i not in matched and actual['image_id'] == prediction['image_id'] and actual['category_id'] == prediction['category_id']]
        best = max(candidates, default=(0, -1))
        if best[0] >= threshold:
            matched.add(best[1])
            true_positive += 1
    return {
        'status': 'evaluated_saved_predictions', 'image_count': len(image_ids), 'ground_truth_boxes': len(truth),
        'predicted_boxes': len(guessed), 'iou_threshold': threshold,
        'metrics': {'true_positive': true_positive, 'false_positive': len(guessed) - true_positive, 'false_negative': len(truth) - true_positive,
                    'precision': true_positive / len(guessed) if guessed else None, 'recall': true_positive / len(truth) if truth else None},
        'limitations': 'Greedy category-aware matching of non-crowd furniture boxes. This is not COCO mAP. No mask, depth, dimensional, or removal-quality evaluation is performed.',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--annotations', type=Path)
    parser.add_argument('--predictions', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'reports/evaluation_report.json')
    args = parser.parse_args()
    if bool(args.annotations) != bool(args.predictions):
        parser.error('Provide both --annotations and --predictions')
    report = evaluate_benchmarks(json.loads(args.annotations.read_text()) if args.annotations else None, json.loads(args.predictions.read_text()) if args.predictions else None)
    if args.annotations:
        report['inputs'] = {'annotations': str(args.annotations), 'predictions': str(args.predictions)}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
