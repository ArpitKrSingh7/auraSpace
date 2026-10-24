# Morrow Room Studio 🛋️
### Intelligent 2D/3D Room Layout & Furniture Visualization Tool

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)](https://nextjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?logo=three.js)](https://threejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python_3.11-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-COCO--SSD-FF6F00?logo=tensorflow)](https://www.tensorflow.org/js)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](https://vercel.com/)

**Morrow Room Studio** is an enterprise-grade spatial planning and furniture visualization web and mobile application. It seamlessly integrates **Image Processing (IP)**, **Computer Vision (CV)**, and **Computer Graphics (CG)** into an intuitive user workflow:

1. **Capture or Upload:** Users take or upload photographs of their room (furnished or empty).
2. **AI Furniture Extraction:** Deep learning models identify furniture items and segment their boundaries.
3. **Removal & Inpainting:** Detected furniture is erased from the photograph, synthesizing an approximate clean empty-room preview.
4. **Sliding Furniture Tray:** Extracted furniture items are placed into a bottom sliding tray with approximate estimated dimensions.
5. **Procedural 2D & 3D Reconstruction:** A near-similar procedural room model is generated instantly with exact floor boundaries and door cutaways.
6. **Arrangement & Walkthrough:** Users drag, rotate, and position furniture from the tray. An eye-level **Inside Mode** allows users to walk around the room and evaluate sightlines before moving physical items.
7. **Custom Objects:** For unsupported or unidentifiable items, users can add dimensioned custom proxy boxes.

---

## 🏛️ Academic Course Requirements: Tri-Pillar Architecture

This project was built to satisfy all three computer vision and graphics course components:

### 1. Image Processing (IP)
- **Luminance Normalization:** Color space transformation from RGB to grayscale using the human photopic standard ITU-R BT.601:
  $$Y = 0.299R + 0.587G + 0.114B$$
- **Spatial Gradient Filtering:** Discrete spatial convolution with dual $3 \times 3$ Sobel masks ($G_x, G_y$) to compute gradient vectors:
  $$|\nabla I| = \sqrt{G_x^2 + G_y^2}, \quad \theta = \operatorname{atan2}(G_y, G_x)$$
- **Contrast Enhancement & CLAHE:** Contrast Limited Adaptive Histogram Equalization to handle indoor lighting variations and shadow artifacts.
- **Morphological Operations:** Dilation, erosion, opening, and closing kernels applied to binary segmentation masks to smooth object boundaries and bridge gaps.
- **Surface Inpainting & Synthesis:** Context-aware multi-directional border sampling and Navier-Stokes / Telea partial differential equation solvers that fill masked furniture regions to produce empty-room visual previews.

### 2. Computer Vision (CV)
- **Deep Object Detection & Segmentation:**
  - Client-side inference powered by `@tensorflow/tfjs` + `@tensorflow-models/coco-ssd` for instant zero-config evaluation in any mobile or desktop browser.
  - Server-side inference powered by PyTorch `maskrcnn_resnet50_fpn_v2` pre-trained on COCO (classes: `chair`, `couch/sofa`, `bed`, `dining table`, `potted plant`).
- **Non-Maximum Suppression (NMS):** Overlapping proposal elimination thresholded on Intersection-over-Union (IoU).
- **Monocular Depth & Scale Estimation:** Recovery of distance along the optical axis ($Z = f \cdot \frac{B}{d}$) combined with horizon and vanishing-point line geometry.
- **Vanishing Point Geometry:** Multi-line Hough transform clustering used to estimate camera perspective, wall-floor junctions, and floor planes.

### 3. Computer Graphics (CG)
- **Interactive Three.js Rendering Pipeline:** Full WebGL scene graph featuring directional shadow maps, ambient and hemisphere lighting, and procedural materials.
- **Dual Synchronized Camera Modes:**
  - **Inside View (Perspective, $68^\circ$ FOV):** Eye-level walkthrough camera with tap-to-walk collision-safe path evaluation.
  - **Overview Mode (Perspective, OrbitControls):** Free 3D orbit around the room center with automatic wall cutaway rendering.
  - **Plan View (Orthographic):** Parallel top-down projection with scale grid lines, dimension metrics, and precise alignment.
- **Separating Axis Theorem (SAT) Collision Detection:** Exact rotated 2D/3D collision checking for oriented bounding boxes (OBBs) at arbitrary yaw angles $\theta$:
  $$\mathbf{u} = \begin{bmatrix} -\Delta z / L \\ \Delta x / L \end{bmatrix}$$
- **Ray-Plane Touch Picking:** Raycasting from viewport coordinates ($NDC \in [-1, 1]$) through the inverse projection-view matrix intersecting the $Y=0$ floor plane for 60 FPS real-time snapping and drag-and-drop.
- **Procedural Mesh Synthesis:** Algorithmic furniture geometry (multi-cushion sofas, platform beds, sideboards, potted plants) generated dynamically without external heavy 3D assets.

---

## 📱 Interactive User Experience

| Flow Step | User Experience |
|-----------|-----------------|
| **Home Studio** | Overview of projects, favorite rooms, sample living/bedroom templates, and one-tap new room creator. |
| **3D / 2D Editor** | Fast top toolbar with view switcher (`Inside`, `Overview`, `Plan`), Undo/Redo, Snapping grid, and Metrics. |
| **Sliding Tray** | Collapsible bottom panel housing furniture catalog items, extracted photo inventory, and custom proxy boxes. |
| **Item Inspector** | Real-time width, depth, height adjustments, rotation buttons (45° / 90°), color picker, and duplicate/lock/delete. |
| **Academic Lab Inspector** | Dedicated modal showing side-by-side Image Processing filters (Grayscale, CLAHE, Sobel Edges, Inpainting), CV detections, and CG matrix mathematics. |
| **Export** | One-click export of complete project state as portable JSON. |

---

## 🚀 Quickstart Guide

### Option A: Next.js Web App (Deployable to Vercel)

The Next.js web application is self-contained and runs on both desktop and mobile browsers.

```bash
# 1. Install dependencies (already installed)
pnpm install

# 2. Start development server
pnpm dev
# App runs at http://localhost:3000

# 3. Build for production (verified)
pnpm build
pnpm start
```

### Option B: Python FastAPI Vision Backend (Optional GPU Service)

For server-side Mask R-CNN and OpenCV acceleration:

```bash
cd services/vision

# 1. Create virtual environment
python3 -m venv venv
source venv/bin/activate

# 2. Install requirements
pip install -r requirements.txt

# 3. Start API server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# API docs at http://localhost:8000/docs
```

---

## 🌐 Deploying to Vercel

The project is structured for zero-configuration deployment to [Vercel](https://vercel.com):

1. Push this repository to GitHub or GitLab.
2. In the Vercel Dashboard, click **New Project** and select this repository.
3. Framework preset will automatically detect **Next.js**.
4. (Optional) Set `NEXT_PUBLIC_VISION_API_URL` if you have hosted the Python FastAPI backend. If omitted, the app defaults to client-side TensorFlow.js detection and canvas processing.
5. Click **Deploy**!

---

## 📂 Repository Structure

```
icgProject/
├── app/
│   ├── api/
│   │   ├── health/route.ts           # Health check endpoint
│   │   └── vision/
│   │       ├── analyze/route.ts      # CV detection proxy/fallback
│   │       ├── inpaint/route.ts      # Furniture removal proxy/fallback
│   │       └── process/route.ts      # Image processing proxy/fallback
│   ├── editor/[id]/page.tsx          # Main 2D/3D room layout studio
│   ├── globals.css                   # Tailwind + design tokens
│   ├── layout.tsx                    # Root HTML layout & fonts
│   └── page.tsx                      # Home screen & project library
├── src/
│   ├── components/
│   │   ├── capture/
│   │   │   └── AnalysisInspector.tsx # Academic Lab (IP, CV, CG visualizer)
│   │   ├── editor/
│   │   │   ├── FurnitureTray.tsx     # Sliding furniture bottom sheet
│   │   │   ├── ItemInspector.tsx     # Object dimension & pose editor
│   │   │   ├── Toolbar.tsx           # Navigation & actions
│   │   │   └── ViewModeSwitch.tsx    # Inside / Overview / Plan toggle
│   │   ├── scene/
│   │   │   ├── FurnitureModel.tsx    # Procedural 3D furniture meshes
│   │   │   ├── SceneCanvas.tsx       # R3F Canvas & Camera manager
│   │   │   └── SceneWorld.tsx        # 3D room, floor, walls, lighting & SAT
│   │   └── ui/                       # Reusable UI component library
│   ├── domain/
│   │   ├── catalog.ts                # Default furniture catalog & samples
│   │   ├── geometry.ts               # SAT collisions, containment, room area
│   │   ├── types.ts                  # Shared TypeScript domain models
│   │   └── validation.ts             # Zod & export schemas
│   ├── services/
│   │   ├── vision-core.ts            # Canvas pixel ops, Sobel, surface fill
│   │   ├── vision.ts                 # Vision service bridge
│   │   └── vision.web.ts             # On-device browser COCO-SSD inference
│   └── store/
│       └── useAppStore.ts            # Zustand global state with undo/redo
├── services/
│   └── vision/                       # Python FastAPI Backend
│       ├── app/
│       │   ├── config.py             # Model thresholds & device config
│       │   ├── depth.py              # Monocular depth estimation
│       │   ├── inference.py          # Mask R-CNN furniture segmentation
│       │   ├── inpainting.py         # Navier-Stokes / Telea inpainting
│       │   ├── main.py               # FastAPI entrypoint & CORS
│       │   ├── preprocessing.py      # OpenCV CLAHE, Sobel, morphology
│       │   ├── room_analysis.py      # Vanishing points & plane fitting
│       │   ├── routes.py             # REST endpoints
│       │   └── schemas.py            # Pydantic request/response models
│       ├── Dockerfile                # Containerized deployment
│       └── requirements.txt          # Python dependencies
├── next.config.mjs                   # Next.js configuration
├── package.json                      # Node dependencies & build scripts
├── PLAN.md                           # Original design specification
└── tsconfig.json                     # TypeScript configuration
```

---

## 🧪 Demonstration Checklist for Teachers & Reviewers

1. **Launch App:** Open `http://localhost:3000` to view pre-loaded sample rooms (Living Room, Bedroom) or create a custom room.
2. **Inside Mode Walkthrough (CG):** Click the **Inside** tab. Click on any visible floor area to walk around the room with continuous smooth camera interpolation.
3. **Overview Mode & Orbital Orbit (CG):** Switch to **Overview**. Left-click and drag to orbit in 3D around the room. Note the front wall cutaway that keeps interior furniture visible.
4. **Collision Detection (CG):** Drag a sofa into a wall or another furniture item. Notice the real-time SAT collision warning banner alerting about the overlap.
5. **Photo Analysis & Detection (CV):** Click the **Camera** icon in the toolbar, upload a room picture, and watch the client-side/server-side detector locate furniture and confidence scores. Click **Add** to transfer the detected item into the room.
6. **Academic Lab Inspector (IP/CV/CG):** Click the **Sparkles** icon in the toolbar. Switch between:
   - **Tab 1 (IP):** Test Grayscale, Contrast Stretching, Sobel Edges, and interactive Before/After Furniture Removal Inpainting with the comparison split slider.
   - **Tab 2 (CV):** Inspect bounding boxes, class scores, and monocular depth cues.
   - **Tab 3 (CG):** View Separating Axis Theorem mathematical formulations and camera projection matrices.
7. **Custom Proxies:** Open the bottom tray and tap **Add Custom Object** to specify custom width, depth, height, and color for uncataloged furniture.
8. **Export:** Click the **Download** icon to export a portable `.morrow.json` project file.
