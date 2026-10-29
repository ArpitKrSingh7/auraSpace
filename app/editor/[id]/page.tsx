'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAppStore } from '@/store/useAppStore';
import type {
  Detection,
  FurnitureItem,
  FurnitureType,
  ViewMode,
  Room,
} from '@/domain/types';
import { CATALOG } from '@/domain/catalog';
import { validatePlacement } from '@/domain/geometry';
import {
  ArrowLeft,
  Eye,
  Layout,
  Map,
  Undo2,
  Redo2,
  Save,
  Download,
  ChevronUp,
  ChevronDown,
  Plus,
  RotateCw,
  Trash2,
  Copy,
  Lock,
  Unlock,
  Move,
  GripHorizontal,
  Camera,
  Settings2,
  X,
  Box,
  Maximize2,
  Grid3x3,
  Magnet,
  AlertTriangle,
  Check,
  Image,
  Sparkles,
  MoreHorizontal,
  SlidersHorizontal,
  FolderOpen,
} from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { exportProjectJson } from '@/domain/validation';
import { downloadFile, exportPlanSvg } from '@/domain/export';
import { AnalysisInspector } from '@/components/capture/AnalysisInspector';

/* Dynamically import the 3D scene to avoid SSR issues */
const SceneCanvas = dynamic(() => import('@/components/scene/SceneCanvas'), {
  ssr: false,
});

/* ── Furniture Type Icons ── */


/* ── View Mode Tab ── */
import { ViewTab } from '@/components/editor/panels/ViewTab';

/* ── Item Inspector Panel ── */
import { ItemInspector } from '@/components/editor/panels/ItemInspector';

/* ── Furniture Tray ── */
import { FurnitureTray } from '@/components/editor/panels/FurnitureTray';

/* ── Room Settings Dialog ── */
import { RoomSettingsDialog } from '@/components/editor/panels/RoomSettingsDialog';

/* ── Export Dialog ── */
import { ExportDialog } from '@/components/editor/panels/ExportDialog';
import { RotationControl } from '@/components/editor/RotationControl';

/* ── Main Editor Page ── */
export default function EditorPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const {
    openProject,
    activeProject: getProject,
    viewMode,
    setViewMode,
    selectedItemId,
    selectItem,
    placingItem,
    cancelPlacing,
    confirmPlacing,
    moveItem,
    undo,
    redo,
    showGrid,
    snap,
    toggleGrid,
    toggleSnap,
    trayOpen,
    setTrayOpen,
    history,
    historyIndex,
    addToast,
    saveLayout,
  } = useAppStore();

  const [mounted, setMounted] = useState(false);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showLayouts, setShowLayouts] = useState(false);
  const [layoutName, setLayoutName] = useState('');
  const [showRotation, setShowRotation] = useState(false);
  const [rotationPreview, setRotationPreview] = useState<{ id: string; angle: number } | null>(null);
  const [roomPreview, setRoomPreview] = useState<Room | null>(null);

  useEffect(() => {
    setMounted(true);
    const state = useAppStore.getState();
    openProject(projectId);
    setTrayOpen(false);
    if (new URLSearchParams(window.location.search).has('capture'))
      setShowPhotoUpload(true);
  }, [projectId, openProject, setTrayOpen]);

  useEffect(() => {
    setShowDetails(false);
    setShowRotation(false);
    setRotationPreview(null);
  }, [selectedItemId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.closest('input, textarea, select, [contenteditable=true]') ||
          document.querySelector('[role=dialog]'))
      )
        return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItemId) {
          useAppStore.getState().removeItem(selectedItemId);
        }
      }
      if (!e.metaKey && !e.ctrlKey && (e.key === 'r' || e.key === 'R')) {
        if (selectedItemId)
          useAppStore.getState().rotateItem(selectedItemId, 45);
      }
      if (e.key === 'Escape') {
        if (placingItem) cancelPlacing();
        else {
          selectItem(null);
          setTrayOpen(false);
          setShowMore(false);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key === '1') setViewMode('inside');
      if (e.key === '2') setViewMode('overview');
      if (e.key === '3') setViewMode('plan');
      if (e.key === 'g') toggleGrid();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    selectedItemId,
    placingItem,
    cancelPlacing,
    selectItem,
    undo,
    redo,
    setViewMode,
    toggleGrid,
  ]);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="animate-pulse text-brand-500">Loading editor…</div>
      </div>
    );
  }

  const candidateProject = getProject();
  const project = candidateProject?.id === projectId ? candidateProject : null;
  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-50 gap-4">
        <p className="text-surface-500">Room not found</p>
        <button
          className="btn-primary text-sm"
          onClick={() => router.push('/')}
        >
          ← Back to Studio
        </button>
      </div>
    );
  }

  const selectedItem =
    project.items.find((i) => i.id === selectedItemId) ?? null;

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#eeeee7]">
      <header className="relative z-40 flex min-h-16 shrink-0 items-center gap-2 border-b border-surface-200 bg-[#faf9f6] px-3 sm:px-5">
        <button
          className="btn-ghost !p-2.5"
          aria-label="Back to studio"
          onClick={() => router.push('/')}
        >
          <ArrowLeft size={19} />
        </button>
        <span className="mx-1 hidden h-6 w-px bg-surface-200 sm:block" />
        <div className="min-w-0 flex-1">
          <input
            aria-label="Room name"
            defaultValue={project.name}
            key={project.id}
            maxLength={100}
            onBlur={(e) => {
              useAppStore.getState().updateProjectName(e.target.value);
              e.target.value =
                useAppStore.getState().activeProject()?.name ?? '';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="w-full max-w-52 truncate bg-transparent text-sm font-semibold outline-none focus:rounded focus:ring-2 focus:ring-brand-200"
          />
          <span className="hidden text-[10px] text-surface-500 sm:block">
            {project.room.width} × {project.room.depth} m · Local workspace
          </span>
        </div>
        <div className="hidden items-center rounded-xl border border-surface-200 bg-surface-100 p-1 md:flex">
          <ViewTab
            mode="inside"
            current={viewMode}
            label="Inside"
            icon={Eye}
            onClick={setViewMode}
          />
          <ViewTab
            mode="overview"
            current={viewMode}
            label="3D view"
            icon={Maximize2}
            onClick={setViewMode}
          />
          <ViewTab
            mode="plan"
            current={viewMode}
            label="Floor plan"
            icon={Layout}
            onClick={setViewMode}
          />
        </div>
        <div className="ml-1 flex items-center gap-0.5 sm:ml-4">
          <button
            className="btn-ghost !p-2.5 disabled:opacity-25"
            disabled={historyIndex <= 0}
            onClick={undo}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={17} />
          </button>
          <button
            className="btn-ghost !p-2.5 disabled:opacity-25"
            disabled={historyIndex >= history.length - 1}
            onClick={redo}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 size={17} />
          </button>
          <button
            className="btn-primary ml-2 hidden !py-2.5 sm:inline-flex"
            onClick={() => setShowExport(true)}
          >
            <Download size={15} />
            Export
          </button>
          <button
            className={`btn-ghost ml-1 !p-2.5 ${showMore ? 'bg-surface-200' : ''}`}
            onClick={() => setShowMore(!showMore)}
            aria-label="More room options"
            aria-expanded={showMore}
          >
            <MoreHorizontal size={21} />
          </button>
        </div>
        {showMore && (
          <>
            <button
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close room options"
              onClick={() => setShowMore(false)}
            />
            <div
              className="absolute right-3 top-[60px] z-50 w-60 rounded-2xl border border-surface-200 bg-white p-2 shadow-elevated"
              role="menu"
              aria-label="Room options"
            >
              {[
                {
                  label: 'Room dimensions & colors',
                  icon: Settings2,
                  action: () => setShowRoomSettings(true),
                },
                {
                  label: 'Room from photo',
                  icon: Camera,
                  action: () => setShowPhotoUpload(true),
                },
                {
                  label: 'Saved layouts',
                  icon: FolderOpen,
                  action: () => setShowLayouts(true),
                },
                {
                  label: 'Export & share',
                  icon: Download,
                  action: () => setShowExport(true),
                },
              ].map(({ label, icon: Icon, action }) => (
                <button
                  role="menuitem"
                  key={label}
                  className="studio-nav !text-xs"
                  onClick={() => {
                    action();
                    setShowMore(false);
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
              <div className="my-2 border-t border-surface-100" />
              <button
                role="menuitemcheckbox"
                aria-checked={showGrid}
                className="studio-nav !text-xs"
                onClick={toggleGrid}
              >
                <Grid3x3 size={16} />
                Floor grid{showGrid && <Check size={14} className="ml-auto" />}
              </button>
              <button
                role="menuitemcheckbox"
                aria-checked={snap}
                className="studio-nav !text-xs"
                onClick={toggleSnap}
              >
                <Magnet size={16} />
                Snap to 10 cm{snap && <Check size={14} className="ml-auto" />}
              </button>
              <div className="my-2 border-t border-surface-100" />
              <button
                role="menuitem"
                className="studio-nav !text-xs"
                onClick={() => {
                  setShowInspector(true);
                  setShowMore(false);
                }}
              >
                <Sparkles size={16} />
                Analysis lab
              </button>
            </div>
          </>
        )}
      </header>
      <div className="absolute left-1/2 top-20 z-20 flex -translate-x-1/2 items-center rounded-xl border border-surface-200 bg-surface-100 p-1 shadow-soft md:hidden">
        <ViewTab
          mode="inside"
          current={viewMode}
          label="Inside"
          icon={Eye}
          onClick={setViewMode}
        />
        <ViewTab
          mode="overview"
          current={viewMode}
          label="3D view"
          icon={Maximize2}
          onClick={setViewMode}
        />
        <ViewTab
          mode="plan"
          current={viewMode}
          label="Plan"
          icon={Layout}
          onClick={setViewMode}
        />
      </div>
      <div className="editor-viewport relative flex-1">
        <SceneCanvas
          project={rotationPreview || roomPreview ? {
            ...project,
            room: roomPreview ?? project.room,
            items: project.items.map((item) => item.id === rotationPreview?.id
              ? { ...item, rotation: rotationPreview.angle } : item),
          } : project}
          mode={viewMode}
          selectedId={selectedItemId}
          showGrid={showGrid}
          snap={snap}
          onSelect={selectItem}
          onMove={moveItem}
          onRotate={(id, rotation) => useAppStore.getState().updateItem(id, { rotation })}
          onPlace={placingItem ? (x, z) => confirmPlacing(x, z) : undefined}
          placing={placingItem}
        />
        {project.items.length === 0 && !placingItem && !trayOpen && (
          <div className="pointer-events-none absolute inset-x-5 top-24 text-center sm:top-8">
            <p className="studio-heading text-2xl text-surface-700">
              A blank canvas. All yours.
            </p>
            <p className="mt-2 text-xs text-surface-500">
              Add your first piece and see your space take shape.
            </p>
          </div>
        )}
        {placingItem && (
          <div className="absolute bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-2xl border border-surface-200 bg-white px-4 py-3 shadow-medium">
            <span className="text-xs font-medium">
              Tap the floor to place {placingItem.name.toLowerCase()}
            </span>
            <button
              className="rounded-md p-1 text-surface-500 hover:bg-surface-100"
              aria-label="Cancel placement"
              onClick={cancelPlacing}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!placingItem && !trayOpen && (
          <div className="absolute bottom-6 left-1/2 z-20 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1 rounded-2xl border border-surface-200 bg-white/95 p-1.5 shadow-medium backdrop-blur-md">
            {selectedItem ? (
              <>
                <span className="hidden max-w-32 truncate border-r border-surface-200 px-3 text-xs font-medium sm:block">
                  {selectedItem.name}
                </span>
                <button
                  className="btn-ghost !px-3 !text-xs"
                  onClick={() => { setShowRotation(false); setShowDetails(!showDetails); }}
                  aria-expanded={showDetails}
                >
                  <SlidersHorizontal size={16} />
                  <span>Details</span>
                </button>
                <button
                  className="btn-ghost !px-3"
                  disabled={selectedItem.locked}
                  aria-label="Rotate selected furniture"
                  title="Rotate freely or enter an angle"
                  aria-expanded={showRotation}
                  onClick={() => { setShowDetails(false); setShowRotation(!showRotation); }}
                >
                  <RotateCw size={16} />
                </button>
                <button
                  className="btn-ghost !px-3"
                  aria-label={
                    selectedItem.locked ? 'Unlock furniture' : 'Lock furniture'
                  }
                  onClick={() =>
                    selectedItem.locked
                      ? useAppStore.getState().unlockItem(selectedItem.id)
                      : useAppStore.getState().lockItem(selectedItem.id)
                  }
                >
                  {selectedItem.locked ? (
                    <Lock size={16} />
                  ) : (
                    <Unlock size={16} />
                  )}
                </button>
                <button
                  className="btn-ghost !px-3"
                  disabled={selectedItem.locked}
                  aria-label="Return furniture to tray"
                  title="Return to furniture tray"
                  onClick={() =>
                    useAppStore.getState().returnToTray(selectedItem.id)
                  }
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  className="btn-ghost !px-2"
                  aria-label="Deselect furniture"
                  title="Finish editing this piece"
                  onClick={() => selectItem(null)}
                >
                  <X size={16} />
                </button>
              </>
            ) : (
              <button
                className="btn-primary whitespace-nowrap !py-3"
                onClick={() => {
                  setShowDetails(false);
                  setTrayOpen(true);
                }}
              >
                <Plus size={17} />
                Add furniture
              </button>
            )}
          </div>
        )}
        {selectedItem && showRotation && !placingItem && !trayOpen && (
          <div className="absolute bottom-24 left-1/2 z-30 w-[min(300px,calc(100%-24px))] -translate-x-1/2 rounded-2xl border border-surface-200 bg-white p-4 shadow-elevated" role="region" aria-label="Rotate furniture">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">Rotate {selectedItem.name}</span>
              <button type="button" aria-label="Close rotation controls" className="rounded-lg p-1.5 hover:bg-surface-100" onClick={() => { setShowRotation(false); setRotationPreview(null); }}><X size={16} /></button>
            </div>
            <RotationControl value={selectedItem.rotation} disabled={selectedItem.locked}
              onPreview={(angle) => setRotationPreview({ id: selectedItem.id, angle })}
              onCancel={() => setRotationPreview(null)}
              onCommit={(rotation) => {
                if (rotation !== selectedItem.rotation) useAppStore.getState().updateItem(selectedItem.id, { rotation });
                setRotationPreview(null);
              }} />
          </div>
        )}
        {selectedItem && showDetails && (
          <div className="absolute bottom-24 right-3 z-30 w-[min(340px,calc(100%-24px))] overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-elevated sm:bottom-auto sm:top-4">
            <ItemInspector
              item={selectedItem}
              onClose={() => setShowDetails(false)}
              onRotationPreview={(angle) => setRotationPreview({ id: selectedItem.id, angle })}
              onRotationEnd={() => setRotationPreview(null)}
            />
          </div>
        )}
      </div>
      <FurnitureTray />
      {showRoomSettings && (
        <RoomSettingsDialog onPreview={setRoomPreview} onClose={() => { setShowRoomSettings(false); setRoomPreview(null); }} />
      )}
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showPhotoUpload && (
        <PhotoUploadDialog
          onClose={() => setShowPhotoUpload(false)}
          onOpenInspector={() => setShowInspector(true)}
        />
      )}
      <Dialog
        open={showLayouts}
        onClose={() => setShowLayouts(false)}
        title="Try another possibility"
      >
        <p className="mb-5 text-sm text-surface-500">
          Keep a version of your arrangement, then experiment. Your room
          dimensions stay the same.
        </p>
        <form
          className="mb-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveLayout(
              layoutName.trim() || `Layout ${project.layouts.length + 1}`,
            );
            setLayoutName('');
            addToast('Layout saved', 'success');
          }}
        >
          <input
            className="input-field"
            aria-label="Layout name"
            placeholder="Name this layout"
            maxLength={100}
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={project.layouts.length >= 30}
          >
            Save
          </button>
        </form>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {project.layouts.length ? (
            project.layouts.map((layout) => (
              <button
                key={layout.id}
                className="flex w-full items-center justify-between rounded-xl border border-surface-200 p-3 text-left hover:bg-brand-50"
                onClick={() => {
                  useAppStore.getState().loadLayout(layout.id);
                  setShowLayouts(false);
                  addToast('Layout restored. Undo is available.', 'success');
                }}
              >
                <span className="text-sm font-medium">{layout.name}</span>
                <span className="text-xs text-brand-600">Restore →</span>
              </button>
            ))
          ) : (
            <p className="py-3 text-center text-xs text-surface-500">
              Your saved layouts will appear here.
            </p>
          )}
        </div>
      </Dialog>
      {showInspector && (
        <AnalysisInspector
          photo={project.photos[project.photos.length - 1] ?? null}
          onClose={() => setShowInspector(false)}
          onAddDetectionToRoom={(detection) => {
            const photo = project.photos[project.photos.length - 1];
            if (photo)
              useAppStore.getState().addDetectionAsItem(photo.id, detection.id);
          }}
          onInpaintPreview={(uri) => {
            const photo = project.photos[project.photos.length - 1];
            if (photo)
              useAppStore
                .getState()
                .updatePhoto(photo.id, { processedUri: uri });
          }}
        />
      )}
    </div>
  );
}

/* ── Photo Upload Dialog ── */
import { PhotoUploadDialog } from '@/components/editor/panels/PhotoUploadDialog';
