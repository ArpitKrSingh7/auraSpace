# AuraSpace 🛋️
### Intelligent 2D/3D Room Layout & Furniture Visualization Tool

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/auraspace)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)](https://nextjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?logo=three.js)](https://threejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python_3.11-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-COCO--SSD-FF6F00?logo=tensorflow)](https://www.tensorflow.org/js)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

**AuraSpace** is an enterprise-grade spatial planning and furniture visualization web and mobile application. It seamlessly integrates **Image Processing (IP)**, **Computer Vision (CV)**, and **Computer Graphics (CG)** into an intuitive user workflow:

1. **Capture or Upload:** Users take or upload photographs of their room (furnished or empty) — or click preset samples.
2. **AI Furniture Extraction:** Deep learning models identify furniture items and segment their boundaries.
3. **Removal & Inpainting:** Detected furniture is erased from the photograph, synthesizing an approximate clean empty-room preview with an interactive split comparison slider.
4. **Sliding Furniture Tray:** Extracted furniture items are placed into a collapsible bottom sliding tray with estimated physical dimensions.
5. **Procedural 2D & 3D Reconstruction:** A near-similar procedural room model is generated instantly with exact floor boundaries and door cutaways.
6. **Arrangement & Walkthrough:** Users drag, rotate, and position furniture from the tray. An eye-level **Inside Mode** allows users to walk around the room and evaluate sightlines before moving physical items.
7. **Custom Objects:** For unsupported or unidentifiable items, users can add dimensioned custom proxy boxes.

---

## ⚡ Can I Deploy This on Vercel with Just One Click?

**YES, ABSOLUTELY! 🚀**

AuraSpace is engineered from the ground up for **100% zero-configuration 1-click deployment on Vercel**:

### Why It Works Out of the Box on Vercel:
1. **Built on Next.js 14 App Router:** Vercel natively detects and optimizes Next.js builds.
2. **Zero-GPU Serverless Architecture:** The primary deep learning computer vision model (`@tensorflow/tfjs` + `coco-ssd`) and the image processing pipeline (Sobel gradients, CLAHE, inpainting) **execute directly in the user's browser client via WebGL & HTML5 Canvas**.
3. **No Expensive GPU Server Required:** You do **not** need to deploy or pay for a separate Python GPU backend server just to test or demonstrate the app. Everything runs on Vercel's standard free tier.
4. **Serverless API Routes:** Backend routes in `app/api/` (`/api/health`, `/api/vision/analyze`, etc.) run automatically as lightweight Vercel Serverless Functions.

### 1-Click Deployment Steps:
1. Push this code to your GitHub account:
   ```bash
   git remote add origin https://github.com/<your-username>/auraspace.git
   git branch -M main
   git push -u origin main
   ```
2. Go to [vercel.com/new](https://vercel.com/new) and import your `auraspace` repository.
3. Leave all build settings at their defaults:
   - **Framework Preset:** `Next.js`
   - **Build Command:** `next build`
   - **Output Directory:** `.next`
4. Click **Deploy**! Within 60 seconds, your application is live on a `.vercel.app` URL and accessible on any smartphone, tablet, or desktop browser.

---

## 📖 Comprehensive Feature Run Guide (How to Use All Features)

Follow this guide to test and demonstrate every single capability of AuraSpace:

### 1. Room Creation & Dimensions
- **Preset Rooms:** On the home screen, click **Sunday Living** (5.2 × 4.2m) or **Bedroom** (4.3 × 4.5m) to open pre-arranged rooms.
- **Custom Room:** Click **+ New Room** on the home screen, specify Room Name, Width (m), Depth (m), and Height (m), and click **Create Room**.
- **Adjust Dimensions in Editor:** Click the ⚙️ **Settings** icon in the editor toolbar to change wall length, depth, ceiling height, and floor/wall paint colors dynamically.

### 2. Photo Upload & Instant Preset Samples
- Click the 📷 **Camera** icon in the editor top toolbar.
- **Option A (Instant 1-Click Demo):** Click either **🛋️ Living Room Sample** or **🛏️ Bedroom Sample**. The app instantly generates a room image with furniture, triggers detection, and shows results without needing any files on disk.
- **Option B (Your Own Photo):** Drag & drop any `.jpg`, `.png`, or `.webp` room picture (or tap to open your mobile camera).

### 3. AI Furniture Extraction
- Once a photo is analyzed, detected furniture items appear in the modal with confidence percentages (e.g., `couch 94%`, `chair 88%`, `table 82%`).
- Click **+ Add** on any detection to immediately transfer that physical item into your room layout.

### 4. Furniture Removal & Inpainting Preview (Interactive Split Slider)
- In the photo modal, click **✨ Open in Academic Lab** (or click the ✨ button in the top toolbar).
- Select **Tab 1: Image Processing**.
- Click **Furniture Removal**.
- The app applies directional surface interpolation and Telea/Navier-Stokes PDEs to erase the furniture from the photo.
- **Drag the center split slider ↔ left and right** to compare the original furnished photo against the synthesized empty room!

### 5. Sliding Furniture Inventory Tray
- The bottom sliding sheet houses your furniture inventory.
- **In Tray Section:** Shows unplaced items extracted from photos. Tap any card to drop it into the room.
- **Catalog Section:** Tap any standard item (Sofa, Chair, Bed, Coffee Table, Sideboard, Plant, Rug) to place it.
- **Swipe / Drag Handle:** Swipe the bottom handle up to view all items, or down to minimize the tray while arranging furniture.

### 6. 3D & 2D Camera Navigation Modes
Switch modes using the tabs in the top toolbar or press keyboard shortcuts (`1`, `2`, `3`):
- **👀 Inside Mode (Walkthrough):**
  - Places an eye-level perspective camera ($Y = 1.55\text{m}$, $68^\circ$ FOV) inside the room.
  - **Tap anywhere on the floor** to walk smoothly to that location. The camera path checks boundaries so you never walk through walls.
- **🔄 Overview Mode (3D Orbit):**
  - Left-click and drag (or single-finger drag on mobile) to orbit around the room in 3D.
  - Scroll wheel (or pinch-to-zoom) to zoom in and out.
  - The front wall automatically drops to cutaway height so interior furniture remains visible.
- **📐 Plan Mode (2D Orthographic):**
  - Top-down parallel CAD projection with high-contrast scale grid lines for millimeter-level layout precision.

### 7. Real-Time Rotated Collision Detection (Separating Axis Theorem / SAT)
- Select any placed furniture item by clicking/tapping on it.
- Drag it so it intersects another item (e.g. push a chair into the sofa) or extends past the room walls.
- An **amber warning badge** immediately appears: *"Overlaps Linen sofa"* or *"Extends beyond the room boundary"*.
- Rotate the item $45^\circ$ or $90^\circ$ using the inspector buttons. The collision engine computes exact Oriented Bounding Box (OBB) projections for arbitrary yaw angles $\theta$.
- Note: Rugs are categorized as floor coverings and do not trigger false collision alarms.

### 8. Custom Proxy Objects (For Unusual / Unsupported Items)
- Open the bottom tray and tap **+ Add Custom Object**.
- Enter an object name (e.g., *"Grand Piano"* or *"Floor Bookshelf"*), set custom Width, Depth, Height, and pick a custom hex color.
- Tap **Add to Room**. The object is generated as a dimensioned 3D proxy box with full SAT collision and clearance checking.

### 9. Academic Lab & Theory Inspector (✨ Toolbar Button)
Click the **✨** button in the top toolbar to open the full academic lab showing live proof for all 3 course components:
- **Tab 1 — Image Processing (IP):**
  - **Grayscale:** ITU-R BT.601 conversion ($Y = 0.299R + 0.587G + 0.114B$).
  - **Contrast Stretch:** Dynamic range histogram stretching.
  - **Sobel / Canny Edges:** Computes gradient magnitude $|\nabla I| = \sqrt{G_x^2 + G_y^2}$.
  - **CLAHE:** Contrast Limited Adaptive Histogram Equalization.
  - **Furniture Removal:** Empty room inpainting.
- **Tab 2 — Computer Vision (CV):**
  - Displays bounding boxes, confidence logits, class classifications, and monocular depth recovery formulas ($Z = f \cdot \frac{B}{d}$).
- **Tab 3 — Computer Graphics (CG):**
  - Formulations for Separating Axis Theorem (SAT), Ray-Plane intersection, and camera projection matrices.
  - **Interactive Bresenham Integer Line Rasterizer Widget:** Click any cell on the discrete pixel grid or click *Randomize Endpoints* to see Bresenham's integer decision variable ($e_2$) plot lines in real time!

### 10. Undo, Redo & Local Storage Persistence
- Make any change (move item, rotate, delete).
- Click **Undo** (or `Ctrl+Z` / `Cmd+Z`) and **Redo** (or `Ctrl+Shift+Z`) in the top toolbar.
- Refresh your browser or close the tab. When you return, all rooms, dimensions, and furniture layouts are restored from `localStorage`.

### 11. Project Export (.auraspace.json)
- Click the 📥 **Download** icon in the toolbar.
- Click **Project File (.json)**.
- A portable `.auraspace.json` file is downloaded containing the full room geometry, photo references, and furniture coordinates. You can share this file with other users.

### 12. Running Automated Unit Tests
Verify mathematical correctness from your terminal:
```bash
pnpm test
```
Runs 7 test cases validating Separating Axis Theorem (SAT) collision math, rotated bounding boxes, room containment, and door sweep clearance.

### 13. (Optional) Running the Python FastAPI Backend & Benchmark Suite
For local GPU/CPU model evaluation:
```bash
# 1. Start the Python FastAPI backend
cd services/vision
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# Interactive Swagger docs: http://localhost:8000/docs

# 2. Run quantitative benchmarks (mAP@0.5, PSNR, SSIM)
python3 scripts/evaluate.py

# 3. Run Python unit tests
python3 -m unittest discover tests/
```

---

## 🏛️ Academic Course Requirements: Tri-Pillar Architecture

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

## 📂 Repository Structure

```
auraspace/
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
│   │   │   └── AnalysisInspector.tsx # Academic Lab (IP, CV, CG & Bresenham widget)
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
│       ├── requirements.txt          # Python dependencies
│       └── scripts/
│           ├── download_models.py    # Offline model weights downloader
│           ├── evaluate.py           # Quantitative evaluation & benchmarks
│           └── prepare_datasets.py   # COCO furniture subset extractor
├── tests/
│   ├── geometry.test.mjs             # SAT collision & math test suite
│   └── validation.test.mjs           # Schema & JSON export test suite
├── docker-compose.yml                # Multi-service container orchestration
├── Dockerfile                        # Production web container
├── next.config.mjs                   # Next.js configuration
├── package.json                      # Node dependencies & build scripts
└── tsconfig.json                     # TypeScript configuration
```
