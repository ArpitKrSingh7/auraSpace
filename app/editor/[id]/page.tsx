'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAppStore } from '@/store/useAppStore';
import type { FurnitureItem, FurnitureType, ViewMode } from '@/domain/types';
import { CATALOG } from '@/domain/catalog';
import { validatePlacement } from '@/domain/geometry';
import {
  ArrowLeft, Eye, Layout, Map, Undo2, Redo2, Save, Download,
  ChevronUp, ChevronDown, Plus, RotateCw, Trash2, Copy, Lock,
  Unlock, Move, GripHorizontal, Camera, Settings2, X, Box,
  Maximize2, Grid3x3, Magnet, AlertTriangle, Check, Image, Sparkles,
} from 'lucide-react';
import { AnalysisInspector } from '@/components/capture/AnalysisInspector';

/* Dynamically import the 3D scene to avoid SSR issues */
const SceneCanvas = dynamic(() => import('@/components/scene/SceneCanvas'), { ssr: false });

/* ── Furniture Type Icons ── */
const typeEmoji: Record<FurnitureType, string> = {
  sofa: '🛋️', chair: '🪑', bed: '🛏️', table: '☕',
  cabinet: '🗄️', plant: '🌿', rug: '🟫', custom: '📦',
};

/* ── View Mode Tab ── */
function ViewTab({ mode, current, label, icon: Icon, onClick }: {
  mode: ViewMode; current: ViewMode; label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: (mode: ViewMode) => void;
}) {
  const active = mode === current;
  return (
    <button
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        active ? 'bg-white text-brand-600 shadow-sm' : 'text-white/80 hover:text-white hover:bg-white/10'
      }`}
      onClick={() => onClick(mode)}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

/* ── Item Inspector Panel ── */
function ItemInspector({ item, onClose }: { item: FurnitureItem; onClose: () => void }) {
  const { rotateItem, resizeItem, recolorItem, lockItem, unlockItem,
    duplicateItem, removeItem, returnToTray, moveItem } = useAppStore();
  const project = useAppStore((s) => s.activeProject());
  const warnings = project ? validatePlacement(item, project.room, project.items) : [];

  const [width, setWidth] = useState(item.width);
  const [depth, setDepth] = useState(item.depth);
  const [height, setHeight] = useState(item.height);

  useEffect(() => { setWidth(item.width); setDepth(item.depth); setHeight(item.height); }, [item.width, item.depth, item.height]);

  const applySize = () => {
    if (width > 0 && depth > 0 && height > 0) {
      resizeItem(item.id, width, depth, height);
    }
  };

  return (
    <div className="bg-white rounded-t-2xl shadow-heavy border-t border-surface-200 animate-slide-up">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100">
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeEmoji[item.type]}</span>
          <div>
            <h3 className="text-sm font-semibold">{item.name}</h3>
            <span className={`text-[10px] ${item.source === 'measured' ? 'text-emerald-600' : 'text-amber-600'}`}>
              {item.source === 'measured' ? '📏 Measured' : item.source === 'estimated' ? '🔍 Estimated' : '📐 Sample'}
            </span>
          </div>
        </div>
        <button className="p-2 rounded-lg hover:bg-surface-100" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      <div className="p-4 space-y-4 max-h-[50vh] overflow-y-auto">
        {/* Dimensions */}
        <div>
          <label className="label mb-2 block">Dimensions (meters)</label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-[10px] text-surface-500">Width</span>
              <input className="input-field text-sm" type="number" step={0.05} min={0.05} max={10}
                value={width} onChange={(e) => setWidth(Number(e.target.value))} onBlur={applySize} />
            </div>
            <div>
              <span className="text-[10px] text-surface-500">Depth</span>
              <input className="input-field text-sm" type="number" step={0.05} min={0.05} max={10}
                value={depth} onChange={(e) => setDepth(Number(e.target.value))} onBlur={applySize} />
            </div>
            <div>
              <span className="text-[10px] text-surface-500">Height</span>
              <input className="input-field text-sm" type="number" step={0.05} min={0.05} max={5}
                value={height} onChange={(e) => setHeight(Number(e.target.value))} onBlur={applySize} />
            </div>
          </div>
        </div>

        {/* Position */}
        {item.placed && (
          <div>
            <label className="label mb-2 block">Position</label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-[10px] text-surface-500">X</span>
                <input className="input-field text-sm" type="number" step={0.1}
                  value={item.x.toFixed(2)}
                  onChange={(e) => moveItem(item.id, Number(e.target.value), item.z)} />
              </div>
              <div>
                <span className="text-[10px] text-surface-500">Z</span>
                <input className="input-field text-sm" type="number" step={0.1}
                  value={item.z.toFixed(2)}
                  onChange={(e) => moveItem(item.id, item.x, Number(e.target.value))} />
              </div>
              <div>
                <span className="text-[10px] text-surface-500">Rotation</span>
                <div className="flex gap-1">
                  <span className="input-field text-sm flex items-center">{item.rotation}°</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Color */}
        <div>
          <label className="label mb-2 block">Color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={item.color} onChange={(e) => recolorItem(item.id, e.target.value)}
              className="w-10 h-10 rounded-lg border border-surface-200 cursor-pointer" />
            <span className="text-xs text-surface-500 font-mono">{item.color}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => rotateItem(item.id, 45)}>
            <RotateCw className="w-3.5 h-3.5" /> Rotate 45°
          </button>
          <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => rotateItem(item.id, 90)}>
            <RotateCw className="w-3.5 h-3.5" /> 90°
          </button>
          <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => duplicateItem(item.id)}>
            <Copy className="w-3.5 h-3.5" /> Duplicate
          </button>
          <button className="btn-ghost text-xs flex items-center gap-1"
            onClick={() => item.locked ? unlockItem(item.id) : lockItem(item.id)}>
            {item.locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {item.locked ? 'Unlock' : 'Lock'}
          </button>
          {item.placed && (
            <button className="btn-ghost text-xs flex items-center gap-1 text-amber-600"
              onClick={() => returnToTray(item.id)}>
              <ChevronDown className="w-3.5 h-3.5" /> To Tray
            </button>
          )}
          <button className="btn-ghost text-xs flex items-center gap-1 text-red-500"
            onClick={() => { removeItem(item.id); onClose(); }}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Furniture Tray ── */
function FurnitureTray() {
  const { addItem, startPlacing, trayOpen, setTrayOpen, addCustomItem } = useAppStore();
  const project = useAppStore((s) => s.activeProject());
  const unplaced = project?.items.filter((i) => !i.placed) ?? [];
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('Custom object');
  const [customW, setCustomW] = useState(0.8);
  const [customD, setCustomD] = useState(0.6);
  const [customH, setCustomH] = useState(0.8);
  const [customColor, setCustomColor] = useState('#A4A8B8');

  const placeFromTray = useAppStore((s) => s.placeFromTray);

  return (
    <div className={`bottom-sheet transition-transform ${trayOpen ? 'translate-y-0' : 'translate-y-[calc(100%-3.5rem)]'}`}>
      {/* Handle */}
      <button
        className="w-full flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing"
        onClick={() => setTrayOpen(!trayOpen)}
      >
        <div className="bottom-sheet-handle" />
        <div className="flex items-center gap-2 text-xs text-surface-500">
          {trayOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          <span>Furniture {unplaced.length > 0 ? `(${unplaced.length} in tray)` : ''}</span>
        </div>
      </button>

      {/* Content */}
      <div className="px-4 pb-6 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 3.5rem)' }}>
        {/* Unplaced items */}
        {unplaced.length > 0 && (
          <div className="mb-4">
            <h4 className="label mb-2">In Tray</h4>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {unplaced.map((item) => (
                <button
                  key={item.id}
                  className="tray-card flex-shrink-0 w-24 bg-surface-50 rounded-xl p-3 text-center hover:bg-brand-50 transition-colors border border-surface-200"
                  onClick={() => {
                    const project = useAppStore.getState().activeProject();
                    if (project) {
                      placeFromTray(item.id, project.room.width / 2, project.room.depth / 2);
                    }
                  }}
                >
                  <div className="text-2xl mb-1">{typeEmoji[item.type]}</div>
                  <div className="text-[10px] font-medium truncate">{item.name}</div>
                  <div className="text-[9px] text-surface-500">{(item.width * 100).toFixed(0)}×{(item.depth * 100).toFixed(0)} cm</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Catalog */}
        <h4 className="label mb-2">Add Furniture</h4>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          {CATALOG.map((entry) => (
            <button
              key={entry.type}
              className="tray-card flex flex-col items-center p-3 rounded-xl hover:bg-brand-50 transition-colors border border-transparent hover:border-brand-200"
              onClick={() => startPlacing(entry.type)}
            >
              <div className="text-2xl mb-1">{typeEmoji[entry.type]}</div>
              <div className="text-[10px] font-medium">{entry.name.split(' ')[0]}</div>
              <div className="text-[9px] text-surface-400">{(entry.width * 100).toFixed(0)}×{(entry.depth * 100).toFixed(0)}</div>
            </button>
          ))}
        </div>

        {/* Custom Object */}
        <div className="mt-4">
          <button
            className="w-full btn-secondary text-xs flex items-center justify-center gap-2"
            onClick={() => setShowCustom(!showCustom)}
          >
            <Box className="w-3.5 h-3.5" />
            {showCustom ? 'Cancel' : 'Add Custom Object'}
          </button>

          {showCustom && (
            <div className="mt-3 bg-surface-50 rounded-xl p-4 space-y-3 animate-slide-down">
              <input className="input-field text-sm" placeholder="Object name" value={customName}
                onChange={(e) => setCustomName(e.target.value)} />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-surface-500">W (m)</span>
                  <input className="input-field text-sm" type="number" step={0.1} min={0.1}
                    value={customW} onChange={(e) => setCustomW(Number(e.target.value))} />
                </div>
                <div>
                  <span className="text-[10px] text-surface-500">D (m)</span>
                  <input className="input-field text-sm" type="number" step={0.1} min={0.1}
                    value={customD} onChange={(e) => setCustomD(Number(e.target.value))} />
                </div>
                <div>
                  <span className="text-[10px] text-surface-500">H (m)</span>
                  <input className="input-field text-sm" type="number" step={0.1} min={0.1}
                    value={customH} onChange={(e) => setCustomH(Number(e.target.value))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer" />
                <button className="btn-primary text-xs flex-1" onClick={() => {
                  addCustomItem(customName, customW, customD, customH, customColor);
                  setShowCustom(false);
                }}>
                  <Plus className="w-3.5 h-3.5 mr-1 inline" /> Add to Room
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Room Settings Dialog ── */
function RoomSettingsDialog({ onClose }: { onClose: () => void }) {
  const { updateRoom } = useAppStore();
  const project = useAppStore((s) => s.activeProject());
  if (!project) return null;

  const [w, setW] = useState(project.room.width);
  const [d, setD] = useState(project.room.depth);
  const [h, setH] = useState(project.room.height);
  const [wallColor, setWallColor] = useState(project.room.wallColor);
  const [floorColor, setFloorColor] = useState(project.room.floorColor);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-heavy w-full max-w-sm p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Room Settings</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label mb-1 block">Width (m)</label>
              <input className="input-field text-sm" type="number" step={0.1} min={1} max={20}
                value={w} onChange={(e) => setW(Number(e.target.value))} />
            </div>
            <div>
              <label className="label mb-1 block">Depth (m)</label>
              <input className="input-field text-sm" type="number" step={0.1} min={1} max={20}
                value={d} onChange={(e) => setD(Number(e.target.value))} />
            </div>
            <div>
              <label className="label mb-1 block">Height (m)</label>
              <input className="input-field text-sm" type="number" step={0.1} min={2} max={5}
                value={h} onChange={(e) => setH(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="label mb-1 block">Wall Color</label>
              <input type="color" value={wallColor} onChange={(e) => setWallColor(e.target.value)}
                className="w-full h-10 rounded-lg cursor-pointer" />
            </div>
            <div className="flex-1">
              <label className="label mb-1 block">Floor Color</label>
              <input type="color" value={floorColor} onChange={(e) => setFloorColor(e.target.value)}
                className="w-full h-10 rounded-lg cursor-pointer" />
            </div>
          </div>
          <div className="bg-surface-50 rounded-xl p-3 text-center">
            <span className="text-xl font-light text-brand-500">{(w * d).toFixed(1)} m²</span>
            <span className="text-xs text-surface-500 ml-2">floor area</span>
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1 text-sm" onClick={onClose}>Cancel</button>
            <button className="btn-primary flex-1 text-sm" onClick={() => {
              updateRoom({ width: w, depth: d, height: h, wallColor, floorColor });
              onClose();
            }}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Export Dialog ── */
function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useAppStore((s) => s.activeProject());
  if (!project) return null;

  const handleExportJSON = () => {
    const { exportProjectJson } = require('@/domain/validation');
    const json = exportProjectJson(project);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-zA-Z0-9]/g, '-')}.morrow.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-heavy w-full max-w-sm p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Export Project</h2>
        <div className="space-y-3">
          <button className="w-full card p-4 text-left hover:shadow-medium transition-all" onClick={handleExportJSON}>
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-brand-500" />
              <div>
                <div className="text-sm font-semibold">Project File (.json)</div>
                <div className="text-xs text-surface-500">Full project data, importable later</div>
              </div>
            </div>
          </button>
          <button className="w-full btn-secondary text-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── Metrics Bar ── */
function MetricsBar() {
  const project = useAppStore((s) => s.activeProject());
  const warnings = useAppStore((s) => s.warnings());
  if (!project) return null;

  const { room } = project;
  const area = room.width * room.depth;
  const placedItems = project.items.filter((i) => i.placed && i.type !== 'rug');
  const occupied = placedItems.reduce((sum, item) => sum + item.width * item.depth, 0);
  const hasOverlap = warnings.some((w) => w.message.includes('Overlaps'));
  const util = hasOverlap ? null : (occupied / area) * 100;

  return (
    <div className="flex items-center gap-4 text-[10px] text-surface-500">
      <span>{room.width}×{room.depth}m ({area.toFixed(1)}m²)</span>
      <span>{placedItems.length} placed</span>
      {util !== null && (
        <span className={util > 70 ? 'text-amber-600' : util > 50 ? 'text-emerald-600' : ''}>
          {util.toFixed(0)}% used
        </span>
      )}
      {warnings.length > 0 && (
        <span className="badge-warning">
          <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
          {warnings.length}
        </span>
      )}
    </div>
  );
}

/* ── Main Editor Page ── */
export default function EditorPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const {
    openProject, activeProject: getProject, viewMode, setViewMode,
    selectedItemId, selectItem, placingItem, cancelPlacing, confirmPlacing,
    moveItem, undo, redo, showGrid, snap, toggleGrid, toggleSnap,
    trayOpen, setTrayOpen, history, historyIndex, addToast,
    saveLayout,
  } = useAppStore();

  const [mounted, setMounted] = useState(false);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [showInspector, setShowInspector] = useState(false);

  useEffect(() => {
    setMounted(true);
    const state = useAppStore.getState();
    if (state.activeProjectId !== projectId) {
      openProject(projectId);
    }
  }, [projectId, openProject]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItemId) {
          useAppStore.getState().removeItem(selectedItemId);
        }
      }
      if (e.key === 'r' || e.key === 'R') {
        if (selectedItemId) useAppStore.getState().rotateItem(selectedItemId, 45);
      }
      if (e.key === 'Escape') {
        if (placingItem) cancelPlacing();
        else selectItem(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
      if (e.key === '1') setViewMode('inside');
      if (e.key === '2') setViewMode('overview');
      if (e.key === '3') setViewMode('plan');
      if (e.key === 'g') toggleGrid();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedItemId, placingItem, cancelPlacing, selectItem, undo, redo, setViewMode, toggleGrid]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="animate-pulse text-brand-500">Loading editor…</div>
      </div>
    );
  }

  const project = getProject();
  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-50 gap-4">
        <p className="text-surface-500">Room not found</p>
        <button className="btn-primary text-sm" onClick={() => router.push('/')}>← Back to Studio</button>
      </div>
    );
  }

  const selectedItem = project.items.find((i) => i.id === selectedItemId) ?? null;

  return (
    <div className="h-screen flex flex-col bg-surface-50 overflow-hidden">
      {/* Top Toolbar */}
      <header className="bg-brand-500 text-white px-3 py-2 flex items-center gap-2 z-40 relative">
        <button className="p-2 rounded-lg hover:bg-white/10" onClick={() => router.push('/')}>
          <ArrowLeft className="w-5 h-5" />
        </button>

        <span className="text-sm font-medium truncate flex-1">{project.name}</span>

        {/* View Mode */}
        <div className="hidden sm:flex items-center gap-1 bg-white/10 rounded-lg p-0.5">
          <ViewTab mode="inside" current={viewMode} label="Inside" icon={Eye} onClick={setViewMode} />
          <ViewTab mode="overview" current={viewMode} label="Overview" icon={Maximize2} onClick={setViewMode} />
          <ViewTab mode="plan" current={viewMode} label="Plan" icon={Layout} onClick={setViewMode} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30"
            disabled={historyIndex <= 0} onClick={undo} title="Undo (Ctrl+Z)">
            <Undo2 className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30"
            disabled={historyIndex >= history.length - 1} onClick={redo} title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg hover:bg-white/10"
            onClick={() => toggleGrid()} title="Toggle Grid">
            <Grid3x3 className={`w-4 h-4 ${showGrid ? '' : 'opacity-50'}`} />
          </button>
          <button className="p-2 rounded-lg hover:bg-white/10"
            onClick={() => toggleSnap()} title="Toggle Snap">
            <Magnet className={`w-4 h-4 ${snap ? '' : 'opacity-50'}`} />
          </button>
          <button className="p-2 rounded-lg hover:bg-white/10"
            onClick={() => setShowRoomSettings(true)} title="Room Settings">
            <Settings2 className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg hover:bg-white/10"
            onClick={() => setShowPhotoUpload(true)} title="Photo Analysis">
            <Camera className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 transition-colors"
            onClick={() => setShowInspector(true)} title="Academic Lab & CV/IP Inspector">
            <Sparkles className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg hover:bg-white/10"
            onClick={() => {
              saveLayout(`Layout ${project.layouts.length + 1}`);
              addToast('Layout saved!', 'success');
            }} title="Save Layout">
            <Save className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg hover:bg-white/10"
            onClick={() => setShowExport(true)} title="Export">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile View Tabs */}
      <div className="sm:hidden flex items-center gap-1 bg-brand-600 px-3 py-1">
        <ViewTab mode="inside" current={viewMode} label="Inside" icon={Eye} onClick={setViewMode} />
        <ViewTab mode="overview" current={viewMode} label="Overview" icon={Maximize2} onClick={setViewMode} />
        <ViewTab mode="plan" current={viewMode} label="Plan" icon={Layout} onClick={setViewMode} />
        <div className="flex-1" />
        <MetricsBar />
      </div>

      {/* Metrics (desktop) */}
      <div className="hidden sm:flex items-center justify-between px-4 py-1.5 bg-surface-100 border-b border-surface-200">
        <MetricsBar />
        {placingItem && (
          <div className="flex items-center gap-2 text-xs text-brand-600 animate-fade-in">
            <span>Click to place {typeEmoji[placingItem.type]} {placingItem.name}</span>
            <button className="badge-warning cursor-pointer" onClick={cancelPlacing}>
              <X className="w-3 h-3 mr-0.5" /> Cancel
            </button>
          </div>
        )}
      </div>

      {/* Viewport */}
      <div className="flex-1 viewport editor-viewport relative">
        <SceneCanvas
          project={project}
          mode={viewMode}
          selectedId={selectedItemId}
          showGrid={showGrid}
          snap={snap}
          onSelect={selectItem}
          onMove={moveItem}
          onPlace={placingItem ? (x, z) => confirmPlacing(x, z) : undefined}
          placing={placingItem}
        />

        {/* Placing indicator */}
        {placingItem && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 glass rounded-full px-4 py-2 shadow-medium animate-slide-up flex items-center gap-2">
            <span className="text-sm">{typeEmoji[placingItem.type]}</span>
            <span className="text-xs font-medium">Tap floor to place</span>
            <button className="text-xs text-red-500 font-medium ml-2" onClick={cancelPlacing}>Cancel</button>
          </div>
        )}
      </div>

      {/* Item Inspector (bottom panel when item selected) */}
      {selectedItem && !trayOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <ItemInspector item={selectedItem} onClose={() => selectItem(null)} />
        </div>
      )}

      {/* Furniture Tray */}
      {!selectedItem && <FurnitureTray />}

      {/* Dialogs */}
      {showRoomSettings && <RoomSettingsDialog onClose={() => setShowRoomSettings(false)} />}
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showPhotoUpload && (
        <PhotoUploadDialog
          onClose={() => setShowPhotoUpload(false)}
          onOpenInspector={() => setShowInspector(true)}
        />
      )}
      {showInspector && (
        <AnalysisInspector
          photo={project.photos[project.photos.length - 1] ?? null}
          onClose={() => setShowInspector(false)}
          onAddDetectionToRoom={(detection) => {
            const photoId = project.photos[project.photos.length - 1]?.id ?? '';
            useAppStore.getState().addDetectionAsItem(photoId, detection.id);
            addToast(`Extracted ${detection.label} to room inventory!`, 'success');
          }}
          onInpaintPreview={(uri) => {
            addToast('Synthesized empty room photo preview!', 'info');
          }}
        />
      )}
    </div>
  );
}

/* ── Photo Upload Dialog ── */
function PhotoUploadDialog({ onClose, onOpenInspector }: { onClose: () => void; onOpenInspector?: () => void }) {
  const { addPhoto, addToast } = useAppStore();
  const project = useAppStore((s) => s.activeProject());
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [detections, setDetections] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      addToast('Please select an image file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUri = e.target?.result as string;
      setPreview(dataUri);

      // Get image dimensions
      const img = new window.Image();
      img.onload = async () => {
        const photo = {
          id: `photo-${Date.now()}`,
          uri: dataUri,
          width: img.naturalWidth,
          height: img.naturalHeight,
          name: file.name,
          detections: [] as any[],
          analysisStatus: 'idle' as const,
        };

        addPhoto(photo);
        setAnalyzing(true);

        try {
          // Dynamic import of vision service
          const vision = await import('@/services/vision.web');
          const results = await vision.analyzePhoto(photo, (msg) => {
            addToast(msg, 'info');
          });
          setDetections(results);

          // Update photo with detections
          useAppStore.getState().updatePhoto(photo.id, {
            detections: results,
            analysisStatus: 'complete',
          });

          addToast(`Found ${results.length} furniture items!`, 'success');
        } catch (err: any) {
          addToast(err.message || 'Analysis failed. Add furniture manually.', 'warning');
          useAppStore.getState().updatePhoto(photo.id, { analysisStatus: 'failed' });
        } finally {
          setAnalyzing(false);
        }
      };
      img.src = dataUri;
    };
    reader.readAsDataURL(file);
  };

  const loadPresetSample = (type: 'living' | 'bedroom') => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = type === 'living' ? '#EDE7DE' : '#E7E5DA';
    ctx.fillRect(0, 0, 800, 320);
    ctx.fillStyle = type === 'living' ? '#C9A982' : '#D4B797';
    ctx.fillRect(0, 320, 800, 220);

    ctx.fillStyle = '#C2B8A8';
    ctx.fillRect(0, 310, 800, 10);

    if (type === 'living') {
      ctx.fillStyle = '#8C9D88';
      ctx.beginPath();
      ctx.rect(140, 240, 320, 180);
      ctx.fill();

      ctx.fillStyle = '#C9977D';
      ctx.beginPath();
      ctx.rect(520, 260, 160, 160);
      ctx.fill();

      ctx.fillStyle = '#B58A60';
      ctx.beginPath();
      ctx.rect(260, 410, 220, 90);
      ctx.fill();
    } else {
      ctx.fillStyle = '#C9B9A5';
      ctx.beginPath();
      ctx.rect(220, 200, 360, 260);
      ctx.fill();

      ctx.fillStyle = '#A7835E';
      ctx.beginPath();
      ctx.rect(120, 300, 80, 120);
      ctx.fill();
    }

    const dataUri = canvas.toDataURL('image/jpeg', 0.9);
    setPreview(dataUri);

    const sampleDetections =
      type === 'living'
        ? [
            { id: `det-${Date.now()}-1`, label: 'couch', type: 'sofa' as const, score: 0.94, box: [140, 240, 320, 180] as [number, number, number, number], source: 'model' as const },
            { id: `det-${Date.now()}-2`, label: 'chair', type: 'chair' as const, score: 0.88, box: [520, 260, 160, 160] as [number, number, number, number], source: 'model' as const },
            { id: `det-${Date.now()}-3`, label: 'dining table', type: 'table' as const, score: 0.82, box: [260, 410, 220, 90] as [number, number, number, number], source: 'model' as const },
          ]
        : [
            { id: `det-${Date.now()}-1`, label: 'bed', type: 'bed' as const, score: 0.96, box: [220, 200, 360, 260] as [number, number, number, number], source: 'model' as const },
            { id: `det-${Date.now()}-2`, label: 'chair', type: 'chair' as const, score: 0.79, box: [120, 300, 80, 120] as [number, number, number, number], source: 'model' as const },
          ];

    const photo = {
      id: `photo-${Date.now()}`,
      uri: dataUri,
      width: 800,
      height: 540,
      name: `${type}-sample-capture.jpg`,
      detections: sampleDetections,
      analysisStatus: 'complete' as const,
    };

    addPhoto(photo);
    setDetections(sampleDetections);
    addToast(`Loaded ${type} room sample with ${sampleDetections.length} AI detections!`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-heavy w-full max-w-lg p-6 animate-scale-in max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">📸 Photo Analysis</h2>
          <button className="p-2 rounded-lg hover:bg-surface-100" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-surface-500 mb-4">
          Upload a room photo and our AI will detect furniture automatically. 
          You can then add detected items to your room layout.
        </p>

        {!preview ? (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-surface-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-all"
              onClick={() => fileInputRef.current?.click()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              <Camera className="w-10 h-10 text-surface-400 mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">Drop a photo here or click to browse</p>
              <p className="text-xs text-surface-500">JPG, PNG, WebP up to 20MP</p>
            </div>

            <div className="pt-2 border-t border-surface-200">
              <p className="text-xs font-semibold text-surface-600 mb-2">Or test immediately with a sample room photo:</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn-secondary text-xs py-2 px-3 flex items-center justify-center gap-1.5"
                  onClick={() => loadPresetSample('living')}
                >
                  🛋️ Living Room Sample
                </button>
                <button
                  type="button"
                  className="btn-secondary text-xs py-2 px-3 flex items-center justify-center gap-1.5"
                  onClick={() => loadPresetSample('bedroom')}
                >
                  🛏️ Bedroom Sample
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-xl overflow-hidden">
              <img src={preview} alt="Room" className="w-full rounded-xl" />
              {analyzing && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="bg-white rounded-xl px-4 py-3 flex items-center gap-2 shadow-lg">
                    <div className="animate-spin w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full" />
                    <span className="text-sm">Analyzing furniture…</span>
                  </div>
                </div>
              )}
            </div>

            {detections.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Detected Furniture</h3>
                <div className="space-y-2">
                  {detections.map((d: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-surface-50 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{typeEmoji[d.type as FurnitureType] || '📦'}</span>
                        <div>
                          <div className="text-sm font-medium capitalize">{d.label}</div>
                          <div className="text-[10px] text-surface-500">
                            Confidence: {(d.score * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>
                      <button
                        className="btn-primary text-xs py-1.5 px-3"
                        onClick={() => {
                          if (project) {
                            useAppStore.getState().addDetectionAsItem(
                              project.photos[project.photos.length - 1]?.id ?? '',
                              d.id
                            );
                            addToast(`Added ${d.label} to room`, 'success');
                          }
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1 inline" /> Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                className="flex-1 btn-primary text-xs py-2.5 flex items-center justify-center gap-1.5"
                onClick={() => {
                  onClose();
                  onOpenInspector?.();
                }}
              >
                <Sparkles className="w-3.5 h-3.5" /> Open in Academic Lab
              </button>
              <button
                className="flex-1 btn-secondary text-xs py-2.5"
                onClick={() => { setPreview(null); setDetections([]); }}
              >
                Upload Another
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
    </div>
  );
}
