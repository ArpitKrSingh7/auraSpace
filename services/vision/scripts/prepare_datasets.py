#!/usr/bin/env python3
"""Filter actual COCO annotations; this does not download or invent photographs."""
import argparse
import json
from pathlib import Path

FURNITURE_CATEGORIES = {62: 'chair', 63: 'couch', 64: 'potted plant', 65: 'bed', 67: 'dining table'}


def prepare_subset(source, limit=500):
    furniture = [a for a in source['annotations'] if a['category_id'] in FURNITURE_CATEGORIES]
    image_ids = set(sorted({a['image_id'] for a in furniture})[:limit])
    return {'info': {'description': 'Furniture subset of supplied COCO annotations; retain source image license metadata.'},
            'images': [i for i in source['images'] if i['id'] in image_ids],
            'annotations': [a for a in furniture if a['image_id'] in image_ids],
            'categories': [c for c in source['categories'] if c['id'] in FURNITURE_CATEGORIES],
            'licenses': source.get('licenses', [])}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('annotations', type=Path, help='Official instances_val2017.json or equivalent')
    parser.add_argument('--limit', type=int, default=500)
    parser.add_argument('--output', type=Path, default=Path('furniture-subset.json'))
    args = parser.parse_args()
    if args.limit < 1:
        parser.error('--limit must be positive')
    subset = prepare_subset(json.loads(args.annotations.read_text()), args.limit)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(subset) + '\n')
    print(f"Selected {len(subset['images'])} images and {len(subset['annotations'])} annotations. Source images must be obtained separately.")
