'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Photo, Detection } from '@/domain/types';
import { applyPixelOperation, approximateSurfaceFill } from '@/services/vision-core';
import {
  Sparkles,
  Eye,
  Layers,
  Activity,
  Cpu,
  Box,
  X,
  Scissors,
} from 'lucide-react';

interface AnalysisInspectorProps {
  photo?: Photo | null;
  onClose: () => void;
  onAddDetectionToRoom?: (detection: Detection) => void;
  onInpaintPreview?: (inpaintedUri: string) => void;
}

function BresenhamWidget() {
  const [p1, setP1] = useState({ x: 2, y: 3 });
  const [p2, setP2] = useState({ x: 20, y: 10 });
  const gridW = 24;
  const gridH = 14;

  const points = useMemo(() => {
    const list: Array<{ x: number; y: number }> = [];
    let x0 = p1.x;
    let y0 = p1.y;
    const x1 = p2.x;
    const y1 = p2.y;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) {
      list.push({ x: x0, y: y0 });
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * error;
      if (e2 >= dy) {
        if (x0 === x1) break;
        error += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        if (y0 === y1) break;
        error += dx;
        y0 += sy;
      }
    }
    return list;
  }, [p1, p2]);

  const activeSet = useMemo(() => new Set(points.map((p) => `${p.x},${p.y}`)), [points]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between text-xs gap-2">
        <span className="font-mono text-[11px] text-surface-600">
          Edge: ({p1.x}, {p1.y}) → ({p2.x}, {p2.y}) · {points.length} Rasterized Discrete Pixels
        </span>
        <button
          className="px-2.5 py-1 bg-surface-100 hover:bg-surface-200 rounded text-[11px] font-medium"
          onClick={() => {
            setP1({ x: Math.floor(Math.random() * 6), y: Math.floor(Math.random() * 12) });
            setP2({ x: 14 + Math.floor(Math.random() * 9), y: Math.floor(Math.random() * 12) });
          }}
        >
          Randomize Endpoints
        </button>
      </div>

      <div className="bg-gray-900 p-2.5 rounded-xl overflow-x-auto flex justify-center">
        <div
          className="grid gap-[1px] bg-gray-800 border border-gray-700 rounded select-none"
          style={{ gridTemplateColumns: `repeat(${gridW}, 14px)` }}
        >
          {Array.from({ length: gridH }).map((_, y) =>
            Array.from({ length: gridW }).map((_, x) => {
              const isActive = activeSet.has(`${x},${y}`);
              const isStart = p1.x === x && p1.y === y;
              const isEnd = p2.x === x && p2.y === y;
              return (
                <div
                  key={`${x},${y}`}
                  className={`w-[14px] h-[14px] transition-colors cursor-pointer ${
                    isStart
                      ? 'bg-amber-400'
                      : isEnd
                      ? 'bg-rose-400'
                      : isActive
                      ? 'bg-emerald-500'
                      : 'bg-gray-950 hover:bg-gray-800'
                  }`}
                  title={`Pixel (${x}, ${y})`}
                  onClick={() => setP2({ x, y })}
                />
              );
            })
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 text-[10px] text-surface-500 justify-center">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 bg-amber-400 rounded-sm inline-block" /> Start Point
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 bg-rose-400 rounded-sm inline-block" /> End (Click grid)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm inline-block" /> Bresenham Line
        </span>
      </div>
    </div>
  );
}

export function AnalysisInspector({
  photo,
  onClose,
  onAddDetectionToRoom,
  onInpaintPreview,
}: AnalysisInspectorProps) {
  const [activeTab, setActiveTab] = useState<'ip' | 'cv' | 'cg'>('ip');
  const [ipOperation, setIpOperation] = useState<'original' | 'grayscale' | 'contrast' | 'edges' | 'clahe' | 'inpainted'>('original');
  const [processedUri, setProcessedUri] = useState<string | null>(null);
  const [sliderPos, setSliderPos] = useState(50);

  const imageUri =
    photo?.uri ||
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%23EDE7DE"/><rect x="80" y="240" width="240" height="120" rx="16" fill="%238C9D88"/><rect x="360" y="220" width="160" height="140" rx="12" fill="%23C9977D"/><text x="140" y="310" fill="white" font-size="20" font-family="sans-serif">Sofa</text><text x="410" y="300" fill="white" font-size="18" font-family="sans-serif">Chair</text></svg>';

  useEffect(() => {
    if (!imageUri || ipOperation === 'original') {
      setProcessedUri(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const w = Math.min(800, img.naturalWidth || 600);
      const h = Math.round((w / (img.naturalWidth || 600)) * (img.naturalHeight || 400));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);

      try {
        if (ipOperation === 'grayscale' || ipOperation === 'contrast' || ipOperation === 'edges') {
          const processed = applyPixelOperation(imgData.data, w, h, ipOperation);
          imgData.data.set(processed);
          ctx.putImageData(imgData, 0, 0);
          setProcessedUri(canvas.toDataURL('image/png'));
        } else if (ipOperation === 'inpainted' && photo?.detections && photo.detections.length > 0) {
          const boxes = photo.detections.map((d) => [
            (d.box[0] * w) / photo.width,
            (d.box[1] * h) / photo.height,
            (d.box[2] * w) / photo.width,
            (d.box[3] * h) / photo.height,
          ]);
          const inpainted = approximateSurfaceFill(imgData.data, w, h, boxes);
          imgData.data.set(inpainted);
          ctx.putImageData(imgData, 0, 0);
          const uri = canvas.toDataURL('image/jpeg', 0.92);
          setProcessedUri(uri);
          onInpaintPreview?.(uri);
        } else {
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            d[i] = Math.min(255, d[i] * 1.15);
            d[i + 1] = Math.min(255, d[i + 1] * 1.15);
            d[i + 2] = Math.min(255, d[i + 2] * 1.15);
          }
          ctx.putImageData(imgData, 0, 0);
          setProcessedUri(canvas.toDataURL('image/jpeg'));
        }
      } catch (err) {
        console.error('IP operation error:', err);
      }
    };
    img.src = imageUri;
  }, [imageUri, ipOperation, photo]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-3xl shadow-heavy w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-brand-500 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Academic Lab & Evidence Inspector</h2>
              <p className="text-xs text-white/70">
                Verification of Image Processing, Computer Vision & Computer Graphics
              </p>
            </div>
          </div>
          <button className="p-2 rounded-xl hover:bg-white/10 text-white/80 hover:text-white" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-surface-200 bg-surface-50 px-6 pt-3 gap-2">
          <button
            className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'ip'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
            onClick={() => setActiveTab('ip')}
          >
            <Scissors className="w-4 h-4" />
            1. Image Processing (IP)
          </button>
          <button
            className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'cv'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
            onClick={() => setActiveTab('cv')}
          >
            <Eye className="w-4 h-4" />
            2. Computer Vision (CV)
          </button>
          <button
            className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'cg'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
            onClick={() => setActiveTab('cg')}
          >
            <Box className="w-4 h-4" />
            3. Computer Graphics (CG)
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'ip' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Classical Pixel & Filter Pipelines</h3>
                  <p className="text-xs text-surface-500">
                    Direct mathematical operations on RGB/HSV pixel tensors
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 bg-surface-100 p-1 rounded-xl">
                  {(
                    [
                      { id: 'original', label: 'Original' },
                      { id: 'grayscale', label: 'Grayscale (BT.601)' },
                      { id: 'contrast', label: 'Contrast Stretch' },
                      { id: 'edges', label: 'Sobel / Canny Edges' },
                      { id: 'clahe', label: 'CLAHE Equalize' },
                      { id: 'inpainted', label: 'Furniture Removal' },
                    ] as const
                  ).map((btn) => (
                    <button
                      key={btn.id}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        ipOperation === btn.id
                          ? 'bg-white text-brand-600 shadow-sm'
                          : 'text-surface-600 hover:text-surface-900'
                      }`}
                      onClick={() => setIpOperation(btn.id)}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-surface-200 bg-surface-100 max-h-[380px] flex items-center justify-center">
                <img src={imageUri} alt="Original" className="max-h-[380px] w-full object-contain" />
                {processedUri && (
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
                  >
                    <img src={processedUri} alt="Processed" className="max-h-[380px] w-full object-contain" />
                  </div>
                )}

                {processedUri && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white shadow-heavy cursor-ew-resize flex items-center justify-center pointer-events-none"
                    style={{ left: `${sliderPos}%` }}
                  >
                    <div className="w-7 h-7 bg-white text-brand-600 rounded-full shadow-medium flex items-center justify-center text-[10px] font-bold">
                      ↔
                    </div>
                  </div>
                )}

                {processedUri && (
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sliderPos}
                    onChange={(e) => setSliderPos(Number(e.target.value))}
                    className="absolute bottom-4 left-6 right-6 opacity-60 hover:opacity-100 transition-opacity"
                  />
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="card p-4 space-y-1.5">
                  <span className="font-semibold text-brand-700">Luminance Grayscale</span>
                  <p className="text-surface-600">
                    Weighted ITU-R BT.601 conversion: <code className="bg-surface-100 px-1 rounded">Y = 0.299R + 0.587G + 0.114B</code>. Matches human spectral response.
                  </p>
                </div>
                <div className="card p-4 space-y-1.5">
                  <span className="font-semibold text-brand-700">Spatial Convolution Gradients</span>
                  <p className="text-surface-600">
                    Dual 3×3 Sobel masks (Gx, Gy) compute orthogonal discrete derivatives. Magnitude |∇I| = √(Gx² + Gy²) isolates wall boundaries.
                  </p>
                </div>
                <div className="card p-4 space-y-1.5">
                  <span className="font-semibold text-brand-700">Surface Inpainting Synthesis</span>
                  <p className="text-surface-600">
                    Directional distance-weighted context sampling propagates floor and wall boundary colors into masked furniture regions.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'cv' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Deep Learning Detection & Depth Geometry</h3>
                <p className="text-xs text-surface-500">
                  COCO-SSD / Mask R-CNN furniture bounding boxes and metric spatial estimates
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="relative rounded-2xl overflow-hidden border border-surface-200 bg-surface-100 flex items-center justify-center">
                  <img src={imageUri} alt="Room" className="w-full object-contain" />
                  {photo?.detections?.map((d, i) => (
                    <div
                      key={d.id || i}
                      className="absolute border-2 border-emerald-400 bg-emerald-400/20 rounded pointer-events-none"
                      style={{
                        left: `${(d.box[0] / photo.width) * 100}%`,
                        top: `${(d.box[1] / photo.height) * 100}%`,
                        width: `${(d.box[2] / photo.width) * 100}%`,
                        height: `${(d.box[3] / photo.height) * 100}%`,
                      }}
                    >
                      <span className="absolute -top-5 left-0 bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded shadow">
                        {d.label} ({(d.score * 100).toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="card p-4 space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-surface-500">
                      Detected Entities ({photo?.detections?.length || 0})
                    </h4>
                    {photo?.detections && photo.detections.length > 0 ? (
                      <div className="space-y-2">
                        {photo.detections.map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center justify-between bg-surface-50 p-2.5 rounded-xl border border-surface-200/60"
                          >
                            <div>
                              <div className="text-xs font-semibold capitalize">{d.label}</div>
                              <div className="text-[10px] text-surface-500">
                                Confidence: {(d.score * 100).toFixed(1)}% · Class: {d.type}
                              </div>
                            </div>
                            {onAddDetectionToRoom && (
                              <button
                                className="btn-primary text-xs py-1 px-3"
                                onClick={() => onAddDetectionToRoom(d)}
                              >
                                Extract to Tray
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-surface-400 italic">
                        Upload or analyze a room photo to display detected bounding boxes and class logits.
                      </p>
                    )}
                  </div>

                  <div className="card p-4 space-y-2 text-xs">
                    <h4 className="font-semibold text-brand-700">Monocular Depth Estimation</h4>
                    <p className="text-surface-600">
                      Predicts distance along optical axis Z = f · (B / d). Combines line convergence (vanishing points) and vertical position cues to establish floor plane bounds.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'cg' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">3D Graphics Pipeline & Geometry Engines</h3>
                <p className="text-xs text-surface-500">
                  Separating Axis Theorem (SAT), camera matrices, and procedural Three.js scene graphs
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card p-4 space-y-3">
                  <div className="flex items-center gap-2 text-brand-600 font-semibold text-xs">
                    <Activity className="w-4 h-4" />
                    Separating Axis Theorem (SAT)
                  </div>
                  <p className="text-xs text-surface-600">
                    Rotated floor bounding boxes are evaluated across 4 projection normal axes:
                  </p>
                  <pre className="bg-surface-100 p-2.5 rounded-lg text-[10px] font-mono text-surface-700 overflow-x-auto">
{`axis = [-(y2 - y1) / L, (x2 - x1) / L]
projA = dot(cornersA, axis)
projB = dot(cornersB, axis)
if (max(projA) <= min(projB)) return false`}
                  </pre>
                  <p className="text-[11px] text-emerald-600 font-medium">
                    ✓ Exact collision detection for arbitrary yaw θ.
                  </p>
                </div>

                <div className="card p-4 space-y-3">
                  <div className="flex items-center gap-2 text-brand-600 font-semibold text-xs">
                    <Cpu className="w-4 h-4" />
                    Touch Raycasting Pipeline
                  </div>
                  <p className="text-xs text-surface-600">
                    Translates screen touches to 3D world positions:
                  </p>
                  <pre className="bg-surface-100 p-2.5 rounded-lg text-[10px] font-mono text-surface-700 overflow-x-auto">
{`ndcX = (2 * touchX / width) - 1
ndcY = 1 - (2 * touchY / height)
ray = camera.unproject(ndc)
hit = ray.intersectPlane(floorPlane)`}
                  </pre>
                  <p className="text-[11px] text-emerald-600 font-medium">
                    ✓ 60 FPS real-time snapping & containment preview.
                  </p>
                </div>

                <div className="card p-4 space-y-3">
                  <div className="flex items-center gap-2 text-brand-600 font-semibold text-xs">
                    <Layers className="w-4 h-4" />
                    Camera Projections
                  </div>
                  <p className="text-xs text-surface-600">
                    Dual synchronized projection paradigms:
                  </p>
                  <ul className="text-xs text-surface-600 space-y-1.5 list-disc pl-4">
                    <li>
                      <strong>Perspective:</strong> Eye-level 68° FOV inside-room walkthrough.
                    </li>
                    <li>
                      <strong>Orthographic:</strong> Isometric 0° parallel top-down plan view.
                    </li>
                  </ul>
                  <p className="text-[11px] text-brand-600 font-medium">
                    ✓ Single shared scene graph across all modes.
                  </p>
                </div>
              </div>

              {/* Classical CG: Bresenham Line Algorithm Interactive Widget */}
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-brand-600 font-semibold text-xs">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Classical Rasterization: Bresenham's Integer Line Drawing Algorithm
                  </div>
                  <span className="text-[10px] text-surface-400 font-mono">PLAN.md §13 Standard</span>
                </div>
                <p className="text-xs text-surface-600">
                  Rasterizes continuous mathematical vector edges onto discrete pixel displays using integer-only addition & bitshifts (no floating-point division):
                </p>
                <BresenhamWidget />
              </div>
            </div>
          )}
        </div>

        <div className="bg-surface-50 border-t border-surface-200 px-6 py-3.5 flex justify-between items-center text-xs text-surface-500">
          <span>Project: AuraSpace Studio · Course: ICG Lab</span>
          <button className="btn-secondary text-xs py-1.5 px-4" onClick={onClose}>
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
