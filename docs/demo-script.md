# Teacher Demonstration Script (Step-by-Step)

Follow this 5-minute live demonstration flow during project review:

1. **Open the Studio:**
   - Launch `http://localhost:3000` or open the deployed Vercel link.
   - Show the Home page with sample projects (**Sunday Living**, **A Slower Morning**) and the **New Room** creator.

2. **Demonstrate 3D Walkthrough & Graphics (CG):**
   - Click into **Sunday Living**.
   - Show **Overview Mode**: Left-click and drag to orbit around the room. Point out that the front wall automatically drops to cutaway height so interior items stay visible.
   - Switch to **Inside Mode**: Point out the eye-level ($1.55\text{m}$) perspective camera. Click on the floor near the sofa to demonstrate walking smoothly through the room.
   - Switch to **Plan Mode**: Show the orthographic 2D top-down projection and scale grid.

3. **Demonstrate SAT Collision Detection (CG):**
   - Drag the lounge chair so it intersects the sofa.
   - Point out the amber warning badge: *"Overlaps Linen sofa"*.
   - Rotate the chair $45^\circ$ using the inspector button to demonstrate that rotated oriented bounding boxes (OBBs) compute exact collision using the Separating Axis Theorem.

4. **Demonstrate Photo Analysis & Furniture Removal (IP & CV):**
   - Click the 📷 **Camera** button in the top toolbar.
   - Click one of the preset sample photos or upload a room picture.
   - Show the detection bounding boxes with labels and confidence scores.
   - Click the ✨ **Academic Lab** button to open the full Inspector:
     - **Tab 1 (Image Processing):** Toggle between Grayscale (BT.601), Contrast Stretch, Sobel/Canny Edges, and **Furniture Removal (Inpainting)** using the interactive split slider.
     - **Tab 2 (Computer Vision):** View bounding boxes, confidence logits, and depth estimation cues.
     - **Tab 3 (Computer Graphics):** View the Separating Axis Theorem formulas, raycasting unprojection math, and projection matrix derivations.

5. **Demonstrate Custom Proxy Box & Export:**
   - Open the bottom furniture tray and click **Add Custom Object**.
   - Enter a custom name (e.g. *"Floor Bookshelf"*), dimensions ($1.2\text{m} \times 0.4\text{m} \times 1.8\text{m}$), and color.
   - Place it into the room and verify that collision warnings apply to custom proxies.
   - Click the **Download** icon in the toolbar and click **Project File (.json)** to download the exported layout.
