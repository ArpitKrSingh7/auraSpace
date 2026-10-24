# Course Evaluation Criteria & Benchmarks

## 1. Grading Matrix Mapping

| Criterion | Target | Demonstrated Location |
|---|---|---|
| **Image Processing (IP)** | Pixel transformations, Sobel gradients, CLAHE, morphological ops, inpainting | `src/components/capture/AnalysisInspector.tsx`, `src/services/vision-core.ts`, `services/vision/app/preprocessing.py` |
| **Computer Vision (CV)** | Deep learning detection, instance boxes, depth recovery, vanishing points | `@tensorflow/tfjs`, `services/vision/app/inference.py`, `services/vision/app/depth.py` |
| **Computer Graphics (CG)** | 3D WebGL scene graph, SAT rotated collision, camera walkthrough, raycasting | `src/components/scene/SceneCanvas.tsx`, `src/components/scene/SceneWorld.tsx`, `src/domain/geometry.ts` |
| **Mobile UX** | Sliding tray, touch targets, inside walkthrough, responsive UI | `app/editor/[id]/page.tsx`, `src/components/editor/FurnitureTray.tsx` |
| **Persistence & Deploy** | Vercel deployment, JSON export, offline localStorage, zero build errors | Next.js App Router, `next build`, `package.json` |

## 2. Public Datasets
- **COCO 2017:** Used for evaluating furniture detection categories (`chair`, `couch`, `bed`, `dining table`, `potted plant`).
- **SUN RGB-D & Hypersim:** Synthetic and real indoor depth benchmarks verifying depth convention along the optical axis.
