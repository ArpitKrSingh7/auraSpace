# AuraSpace viva handbook

- [44-page PDF](AuraSpace_End_to_End_Viva_Guide.pdf)
- [Editable Markdown source](Viva_Guide.md)
- [PDF and visual-plate builder](build_guide.py)

The three main sections cover image processing (pages 5–13), computer vision (14–24), and interactive computer graphics with supporting infrastructure (25–42). The opening pages explain the problem and architecture; the final pages provide a source map and linked primary references.

The handbook distinguishes implemented behavior, recorded execution evidence, limitations and proposed improvements. Model and stack choices are explained as engineering tradeoffs, not undocumented historical decisions or measured comparisons. No custom training, independent accuracy benchmark, automatic room reconstruction or physical-phone performance is claimed.

## Rebuild

From the repository root in the prepared Python environment:

```sh
python3 docs/viva/build_guide.py
```

Dependencies: ReportLab, Pillow, OpenCV, NumPy and PyTorch (imported by the vision configuration). The builder uses the included COCO image plus existing ignored `.artifacts/model-smoke/analysis.json` and `removal.png`. It verifies the source-image hash and exact outside-selection preservation against the reconstructed recorded smoke mask. It does not rerun learned inference.

The generated `layout-report.json` records per-page content height and any modest vertical fitting. The PDF has searchable embedded text, embedded fonts, linked primary references, vector block diagrams and an outline entry for every page.

## Checks performed for this deliverable

- PDF built successfully: 44 A4 pages, approximately 1 MB.
- All 44 pages rendered to thumbnails and reviewed as contact sheets; architecture, calibration and model panels also inspected at larger size.
- Extracted all PDF text; verified required section titles and absence of replacement characters.
- Checked bounding boxes of extracted words on every page: none outside the intended page bounds.
- `pnpm test`: all six JavaScript test files passed. The repository's prior verification record describes 42 individual cases.
- Python unittest discovery: 19 tests passed. The sandbox's FastAPI in-process client stalled; rerunning the existing suite outside the sandbox passed.
- No application source or settings changed; only `docs/viva/` was added.

Existing platform, real-model, browser and emulator results are attributed to repository records. Hosted integration, learned accuracy, physical-phone acceptance and production deployment checks were not repeated for this documentation task.
