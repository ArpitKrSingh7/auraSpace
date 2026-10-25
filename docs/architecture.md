# System Architecture & Technical Specifications

## 1. Overview
AuraSpace is a client-server spatial layout and furniture visualization tool.
It bridges 2D digital image observations with a continuous 3D parametric scene graph.

## 2. Coordinate System Standards
Physical geometry is stored in standard **meters** adhering to a right-handed Cartesian coordinate system:
- $+X$: To the right across the room width.
- $+Y$: Upwards from floor level ($Y = 0$ is the floor plane).
- $+Z$: Along the room depth towards the entrance wall.
- Stored rotation: clockwise plan angle in degrees. The renderer converts this to negative yaw around $+Y$ so mesh footprints match the geometry checks.

## 3. Mathematical Foundations

### 3.1 Separating Axis Theorem (SAT)
For any two oriented bounding boxes $A$ and $B$, their footprints do not overlap if and only if there exists a line (axis) onto which their projections do not intersect. The candidate axes are the 4 edge normals of polygons $A$ and $B$:
$$\mathbf{e}_i = \mathbf{p}_{i+1} - \mathbf{p}_i, \quad \mathbf{n}_i = \begin{bmatrix} -\Delta z_i / L \\ \Delta x_i / L \end{bmatrix}$$
Every corner point $\mathbf{v} \in A$ and $\mathbf{w} \in B$ is projected onto normal $\mathbf{n}_i$:
$$s = \mathbf{v} \cdot \mathbf{n}_i$$
If $\max(s_A) \le \min(s_B)$ or $\max(s_B) \le \min(s_A)$, the objects are separated.

### 3.2 Normalized Device Coordinates to World Raycasting
A viewport touch event at $(x, y)$ on a canvas with width $W$ and height $H$ is normalized:
$$x_{ndc} = \frac{2x}{W} - 1, \quad y_{ndc} = 1 - \frac{2y}{H}$$
Using the inverse view-projection matrix $\mathbf{M}^{-1} = (\mathbf{P} \cdot \mathbf{V})^{-1}$:
$$\mathbf{r}_{near} = \mathbf{M}^{-1} \begin{bmatrix} x_{ndc} \\ y_{ndc} \\ -1 \\ 1 \end{bmatrix}, \quad \mathbf{r}_{far} = \mathbf{M}^{-1} \begin{bmatrix} x_{ndc} \\ y_{ndc} \\ 1 \\ 1 \end{bmatrix}$$
The floor intersection at $Y = 0$ is found at parameter $t = -r_{near, y} / (r_{far, y} - r_{near, y})$.
Snapping aligns $(X_{hit}, Z_{hit})$ to $0.10\text{m}$ intervals.

## Android and durable platform implementation

The native app lives in `apps/mobile`. `packages/scene-domain` is the shared scene-v2 schema and command engine; `packages/scene-assets` contains procedural furniture; `packages/contracts` contains validated HTTP/job contracts. API route modules live in `apps/api/src/routes`; `apps/worker` executes persisted jobs against the private Python service.

Scene v2 stores `floorCenterXM`, `floorCenterZM` and `yawRad` explicitly. Yaw is radians around the positive Y axis; the legacy web adapter converts clockwise degrees to negative yaw. Observations retain oriented source-image pixels. Capture mappings record analysis-copy scale independently. Physical items have per-axis sourced dimensions; layouts reference item IDs and contain only poses/locks. A fixed fixture must have the same locked placement in every layout.

SQLite uses WAL and stores validated scene documents, media records, jobs, preferences, server-specific revision links and an operation outbox. Originals and downloaded results use relative paths under app document storage. Project export is a ZIP with an asset manifest and hashes. Import/conflict copying remaps capture and media identities so separate cloud projects cannot accidentally share globally unique records.

The API authenticates every project/capture/job/artifact request, checks ownership before access, and uses compare-and-swap scene writes. Guest credentials are random bearer tokens stored only as hashes on the server; optional OIDC verifies issuer/audience/signature. Media objects are private, addressed by durable IDs and checksum; signed access URLs are temporary.

Creating a job stores an immutable scene snapshot, revision, mask revisions and idempotency hash before enqueueing. PostgreSQL remains the durable source of job intent if Redis is temporarily unavailable. BullMQ uses leases, retries and stage updates. Recovery re-enqueues missing queued jobs; cancellation and project tombstones are checked between stages. The worker stores proposal artifacts and never mutates the current scene. Mobile accepts results explicitly and preserves reviewed observations and user measurements.

The model runtime loads operator-configured, checksum-verified local weights. Mask R-CNN inference is bounded and returns source-coordinate masks/cutouts. Big-LaMa has a separately labelled OpenCV fallback. Metric depth retains learned meters; visualization normalization is separate from 16-bit millimeter transport. Placeholder floor corners are identified as such, and dimensions remain editable measurements rather than inferred from image colors.

The web client retains its legacy browser-local project format and HTTP vision proxy. Its scene panels are modularized, but it is not an additional frontend to the native cloud workspace yet.
