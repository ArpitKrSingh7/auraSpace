# System Architecture & Technical Specifications

## 1. Overview
Morrow Room Studio is a client-server spatial layout and furniture visualization tool.
It bridges 2D digital image observations with a continuous 3D parametric scene graph.

## 2. Coordinate System Standards
Physical geometry is stored in standard **meters** adhering to a right-handed Cartesian coordinate system:
- $+X$: To the right across the room width.
- $+Y$: Upwards from floor level ($Y = 0$ is the floor plane).
- $+Z$: Along the room depth towards the entrance wall.
- $\theta$ (Yaw): Rotation around the $+Y$ vertical axis in degrees.

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
