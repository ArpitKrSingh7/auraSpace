'use client';

import { create } from 'zustand';
import type {
  FurnitureItem,
  FurnitureType,
  Photo,
  Project,
  Room,
  Settings,
  ViewMode,
  LayoutSnapshot,
} from '@/domain/types';
import {
  CATALOG,
  DEFAULT_SETTINGS,
  createSampleProjects,
  makeItem,
  makeProject,
  newId,
} from '@/domain/catalog';
import {
  getProjectWarnings,
  normalizeRotation,
  snapPosition,
  type ProjectWarning,
} from '@/domain/geometry';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

export interface HistoryEntry {
  items: FurnitureItem[];
  room: Room;
  label?: string;
}

export interface AppState {
  /* Projects */
  projects: Project[];
  activeProjectId: string | null;

  /* Editor */
  viewMode: ViewMode;
  selectedItemId: string | null;
  selectedId: string | null; // alias for selectedItemId
  placingItem: FurnitureItem | null;
  placingType: FurnitureType | null;
  showGrid: boolean;
  snap: boolean;

  /* History */
  history: HistoryEntry[];
  historyIndex: number;

  /* Settings */
  settings: Settings;

  /* UI */
  trayOpen: boolean;
  inspectorOpen: boolean;
  sidebarOpen: boolean;
  bottomSheetOpen: boolean;
  bottomSheetExpanded: boolean;
  dialogOpen: string | null;
  toasts: Toast[];
  photoAnalysisOpen: boolean;

  /* Computed */
  activeProject: () => Project | null;
  getActiveProject: () => Project | null;
  warnings: () => ProjectWarning[];

  /* Project actions */
  createProject: (name: string, width: number, depth: number, height: number) => string;
  openProject: (id: string) => void;
  loadProject: (id: string) => void; // alias for openProject
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => void;
  toggleFavorite: (id: string) => void;
  updateProjectName: (name: string) => void;

  /* Room actions */
  updateRoom: (room: Partial<Room>) => void;

  /* Item actions */
  addItem: (type: FurnitureType, overrides?: Partial<FurnitureItem>) => void;
  addCustomItem: (name: string, width: number, depth: number, height: number, color: string) => void;
  removeItem: (id: string) => void;
  moveItem: (id: string, x: number, z: number) => void;
  rotateItem: (id: string, degrees: number) => void;
  resizeItem: (id: string, width: number, depth: number, height: number) => void;
  recolorItem: (id: string, color: string) => void;
  updateItem: (id: string, updates: Partial<FurnitureItem>) => void;
  lockItem: (id: string) => void;
  unlockItem: (id: string) => void;
  duplicateItem: (id: string) => void;
  returnToTray: (id: string) => void;
  placeFromTray: (id: string, x: number, z: number) => void;
  placeItem: (x: number, z: number) => void;

  /* Placing mode */
  startPlacing: (type: FurnitureType) => void;
  setPlacing: (type: FurnitureType | null) => void;
  confirmPlacing: (x: number, z: number) => void;
  cancelPlacing: () => void;

  /* Selection */
  selectItem: (id: string | null) => void;
  select: (id: string | null) => void;

  /* View */
  setViewMode: (mode: ViewMode) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;

  /* History */
  undo: () => void;
  redo: () => void;
  pushHistory: (label?: string) => void;

  /* Layouts */
  saveLayout: (name: string) => void;
  loadLayout: (layoutId: string) => void;

  /* Settings */
  updateSettings: (updates: Partial<Settings>) => void;

  /* UI */
  setTrayOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setBottomSheet: (open: boolean, expanded?: boolean) => void;
  openDialog: (id: string) => void;
  closeDialog: () => void;
  setPhotoAnalysisOpen: (open: boolean) => void;
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;

  /* Photos */
  addPhoto: (photo: Photo) => void;
  updatePhoto: (id: string, updates: Partial<Photo>) => void;
  removePhoto: (id: string) => void;
  addDetectionAsItem: (photoId: string, detectionId: string) => void;

  /* Persistence */
  saveToStorage: () => void;
  loadFromStorage: () => void;
  initSamples: () => void;
}

const STORAGE_KEY = 'auraspace-studio';

function getStoredState(): { projects?: Project[]; settings?: Settings } {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('morrow-room-studio');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persistState(projects: Project[], settings: Settings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, settings }));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
}

export const useAppStore = create<AppState>((set, get) => {
  const initialData = getStoredState();
  const initialProjects: Project[] =
    initialData.projects && initialData.projects.length > 0
      ? initialData.projects
      : createSampleProjects();

  const getActive = (): Project | null => {
    const state = get();
    return state.projects.find((p) => p.id === state.activeProjectId) ?? null;
  };

  const updateActive = (updater: (project: Project) => Partial<Project>) => {
    const current = getActive();
    if (!current) return;
    const updates = updater(current);
    const updated: Project = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    const nextProjects = get().projects.map((p) => (p.id === updated.id ? updated : p));
    set({ projects: nextProjects });
    persistState(nextProjects, get().settings);
  };

  return {
    /* ── State ── */
    projects: initialProjects,
    activeProjectId: initialProjects[0]?.id ?? null,
    viewMode: 'overview',
    selectedItemId: null,
    selectedId: null,
    placingItem: null,
    placingType: null,
    showGrid: true,
    snap: true,
    history: [],
    historyIndex: -1,
    settings: { ...DEFAULT_SETTINGS, ...(initialData.settings || {}) },
    trayOpen: false,
    inspectorOpen: false,
    sidebarOpen: false,
    bottomSheetOpen: false,
    bottomSheetExpanded: false,
    dialogOpen: null,
    toasts: [],
    photoAnalysisOpen: false,

    /* ── Computed ── */
    activeProject: getActive,
    getActiveProject: getActive,
    warnings: () => {
      const p = getActive();
      return p ? getProjectWarnings(p) : [];
    },

    /* ── Project actions ── */
    createProject: (name, width, depth, height) => {
      const project = makeProject(name, width, depth, height);
      const next = [project, ...get().projects];
      set({
        projects: next,
        activeProjectId: project.id,
        viewMode: 'overview',
        selectedItemId: null,
        selectedId: null,
        placingItem: null,
        placingType: null,
        history: [{ items: [], room: project.room }],
        historyIndex: 0,
      });
      persistState(next, get().settings);
      return project.id;
    },

    openProject: (id) => {
      const p = get().projects.find((item) => item.id === id);
      if (!p) return;
      set({
        activeProjectId: id,
        viewMode: 'overview',
        selectedItemId: null,
        selectedId: null,
        placingItem: null,
        placingType: null,
        history: [{ items: JSON.parse(JSON.stringify(p.items)), room: JSON.parse(JSON.stringify(p.room)) }],
        historyIndex: 0,
      });
    },

    loadProject: (id) => get().openProject(id),

    deleteProject: (id) => {
      const next = get().projects.filter((p) => p.id !== id);
      set({
        projects: next,
        activeProjectId: get().activeProjectId === id ? (next[0]?.id ?? null) : get().activeProjectId,
      });
      persistState(next, get().settings);
    },

    duplicateProject: (id) => {
      const original = get().projects.find((p) => p.id === id);
      if (!original) return;
      const copy: Project = {
        ...JSON.parse(JSON.stringify(original)),
        id: newId('room'),
        name: `${original.name} (copy)`,
        sample: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const next = [copy, ...get().projects];
      set({ projects: next });
      persistState(next, get().settings);
    },

    toggleFavorite: (id) => {
      const next = get().projects.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p));
      set({ projects: next });
      persistState(next, get().settings);
    },

    updateProjectName: (name) => {
      updateActive(() => ({ name }));
    },

    updateRoom: (roomUpdates) => {
      get().pushHistory('Update room');
      updateActive((p) => ({
        room: { ...p.room, ...roomUpdates },
      }));
    },

    /* ── Item actions ── */
    addItem: (type, overrides = {}) => {
      get().pushHistory(`Add ${type}`);
      const item = makeItem(type, overrides);
      updateActive((p) => ({
        items: [...p.items, item],
      }));
      set({ selectedItemId: item.id, selectedId: item.id });
    },

    addCustomItem: (name, width, depth, height, color) => {
      get().pushHistory('Add custom object');
      const item = makeItem('custom', {
        name,
        width,
        depth,
        height,
        color,
        source: 'measured',
      });
      updateActive((p) => ({
        items: [...p.items, item],
      }));
      set({ selectedItemId: item.id, selectedId: item.id });
    },

    removeItem: (id) => {
      get().pushHistory('Delete item');
      updateActive((p) => ({
        items: p.items.filter((item) => item.id !== id),
      }));
      set((s) => ({
        selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
        selectedId: s.selectedId === id ? null : s.selectedId,
      }));
    },

    moveItem: (id, x, z) => {
      const snap = get().snap;
      updateActive((p) => ({
        items: p.items.map((item) =>
          item.id === id
            ? {
                ...item,
                x: snapPosition(x, snap),
                z: snapPosition(z, snap),
                placed: true,
              }
            : item
        ),
      }));
    },

    rotateItem: (id, degrees) => {
      get().pushHistory('Rotate item');
      updateActive((p) => ({
        items: p.items.map((item) =>
          item.id === id
            ? { ...item, rotation: normalizeRotation(item.rotation + degrees) }
            : item
        ),
      }));
    },

    resizeItem: (id, width, depth, height) => {
      get().pushHistory('Resize item');
      updateActive((p) => ({
        items: p.items.map((item) =>
          item.id === id ? { ...item, width, depth, height, source: 'measured' as const } : item
        ),
      }));
    },

    recolorItem: (id, color) => {
      updateActive((p) => ({
        items: p.items.map((item) => (item.id === id ? { ...item, color } : item)),
      }));
    },

    updateItem: (id, updates) => {
      updateActive((p) => ({
        items: p.items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      }));
    },

    lockItem: (id) => {
      updateActive((p) => ({
        items: p.items.map((item) => (item.id === id ? { ...item, locked: true } : item)),
      }));
    },

    unlockItem: (id) => {
      updateActive((p) => ({
        items: p.items.map((item) => (item.id === id ? { ...item, locked: false } : item)),
      }));
    },

    duplicateItem: (id) => {
      get().pushHistory('Duplicate item');
      const project = getActive();
      if (!project) return;
      const original = project.items.find((item) => item.id === id);
      if (!original) return;
      const copy: FurnitureItem = {
        ...JSON.parse(JSON.stringify(original)),
        id: newId(),
        name: `${original.name} (copy)`,
        x: original.x + 0.3,
        z: original.z + 0.3,
        locked: false,
      };
      updateActive((p) => ({
        items: [...p.items, copy],
      }));
      set({ selectedItemId: copy.id, selectedId: copy.id });
    },

    returnToTray: (id) => {
      get().pushHistory('Return to tray');
      updateActive((p) => ({
        items: p.items.map((item) =>
          item.id === id ? { ...item, placed: false, x: 0, z: 0 } : item
        ),
      }));
      set((s) => ({
        selectedItemId: s.selectedItemId === id ? null : s.selectedItemId,
        selectedId: s.selectedId === id ? null : s.selectedId,
      }));
    },

    placeFromTray: (id, x, z) => {
      get().pushHistory('Place from tray');
      const snap = get().snap;
      updateActive((p) => ({
        items: p.items.map((item) =>
          item.id === id
            ? {
                ...item,
                placed: true,
                x: snapPosition(x, snap),
                z: snapPosition(z, snap),
              }
            : item
        ),
      }));
    },

    placeItem: (x, z) => {
      const { placingType, placingItem } = get();
      if (placingItem) {
        get().confirmPlacing(x, z);
      } else if (placingType) {
        get().addItem(placingType, { x, z, placed: true });
        set({ placingType: null });
      }
    },

    /* ── Placing mode ── */
    startPlacing: (type) => {
      const item = makeItem(type, { placed: false });
      set({
        placingItem: item,
        placingType: type,
        selectedItemId: null,
        selectedId: null,
        trayOpen: false,
      });
    },

    setPlacing: (type) => {
      if (!type) {
        set({ placingType: null, placingItem: null });
      } else {
        get().startPlacing(type);
      }
    },

    confirmPlacing: (x, z) => {
      const placing = get().placingItem;
      if (!placing) return;
      get().pushHistory('Place furniture');
      const snap = get().snap;
      const item: FurnitureItem = {
        ...placing,
        placed: true,
        x: snapPosition(x, snap),
        z: snapPosition(z, snap),
      };
      updateActive((p) => ({
        items: [...p.items, item],
      }));
      set({
        placingItem: null,
        placingType: null,
        selectedItemId: item.id,
        selectedId: item.id,
      });
    },

    cancelPlacing: () => {
      set({ placingItem: null, placingType: null });
    },

    /* ── Selection ── */
    selectItem: (id) => set({ selectedItemId: id, selectedId: id }),
    select: (id) => set({ selectedItemId: id, selectedId: id }),

    /* ── View ── */
    setViewMode: (mode) => set({ viewMode: mode, selectedItemId: null, selectedId: null }),
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    toggleSnap: () => set((s) => ({ snap: !s.snap })),

    /* ── History ── */
    pushHistory: (label) => {
      const project = getActive();
      if (!project) return;
      const entry: HistoryEntry = {
        items: JSON.parse(JSON.stringify(project.items)),
        room: JSON.parse(JSON.stringify(project.room)),
        label,
      };
      const trimmed = get().history.slice(0, get().historyIndex + 1);
      const capped = trimmed.length >= 50 ? trimmed.slice(1) : trimmed;
      set({
        history: [...capped, entry],
        historyIndex: capped.length,
      });
    },

    undo: () => {
      const { history, historyIndex } = get();
      if (historyIndex <= 0) return;
      const newIndex = historyIndex - 1;
      const entry = history[newIndex];
      if (!entry) return;
      updateActive(() => ({
        items: JSON.parse(JSON.stringify(entry.items)),
        room: JSON.parse(JSON.stringify(entry.room)),
      }));
      set({ historyIndex: newIndex });
    },

    redo: () => {
      const { history, historyIndex } = get();
      if (historyIndex >= history.length - 1) return;
      const newIndex = historyIndex + 1;
      const entry = history[newIndex];
      if (!entry) return;
      updateActive(() => ({
        items: JSON.parse(JSON.stringify(entry.items)),
        room: JSON.parse(JSON.stringify(entry.room)),
      }));
      set({ historyIndex: newIndex });
    },

    /* ── Layouts ── */
    saveLayout: (name) => {
      updateActive((p) => ({
        layouts: [
          ...p.layouts,
          {
            id: newId('layout'),
            name,
            items: JSON.parse(JSON.stringify(p.items)),
            createdAt: new Date().toISOString(),
          },
        ],
      }));
    },

    loadLayout: (layoutId) => {
      const p = getActive();
      const layout = p?.layouts.find((l) => l.id === layoutId);
      if (!layout) return;
      get().pushHistory(`Load layout ${layout.name}`);
      updateActive(() => ({
        items: JSON.parse(JSON.stringify(layout.items)),
      }));
    },

    /* ── Settings ── */
    updateSettings: (updates) => {
      const nextSettings = { ...get().settings, ...updates };
      set({ settings: nextSettings });
      persistState(get().projects, nextSettings);
    },

    /* ── UI ── */
    setTrayOpen: (open) => set({ trayOpen: open, bottomSheetOpen: open }),
    setInspectorOpen: (open) => set({ inspectorOpen: open }),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setBottomSheet: (open, expanded) =>
      set({
        bottomSheetOpen: open,
        trayOpen: open,
        ...(expanded !== undefined ? { bottomSheetExpanded: expanded } : {}),
      }),
    openDialog: (id) => set({ dialogOpen: id }),
    closeDialog: () => set({ dialogOpen: null }),
    setPhotoAnalysisOpen: (open) => set({ photoAnalysisOpen: open }),

    addToast: (message, type = 'info') => {
      const toast: Toast = { id: newId('toast'), message, type, duration: 3000 };
      set((s) => ({ toasts: [...s.toasts, toast] }));
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== toast.id) }));
      }, toast.duration || 3000);
    },

    removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    /* ── Photos ── */
    addPhoto: (photo) => {
      updateActive((p) => ({
        photos: [...p.photos, photo],
      }));
    },

    updatePhoto: (id, updates) => {
      updateActive((p) => ({
        photos: p.photos.map((ph) => (ph.id === id ? { ...ph, ...updates } : ph)),
      }));
    },

    removePhoto: (id) => {
      updateActive((p) => ({
        photos: p.photos.filter((ph) => ph.id !== id),
      }));
    },

    addDetectionAsItem: (photoId, detectionId) => {
      const project = getActive();
      if (!project) return;
      const photo = project.photos.find((ph) => ph.id === photoId);
      const detection = photo?.detections.find((d) => d.id === detectionId);
      if (!detection) return;
      const catalogEntry = CATALOG.find((c) => c.type === detection.type);
      const item = makeItem(detection.type, {
        name: catalogEntry?.name ?? detection.label,
        source: 'estimated',
        photoId,
        detectionId,
      });
      get().pushHistory(`Add detected ${detection.label}`);
      updateActive((p) => ({
        items: [...p.items, item],
      }));
    },

    /* ── Persistence ── */
    saveToStorage: () => {
      persistState(get().projects, get().settings);
    },

    loadFromStorage: () => {
      const data = getStoredState();
      if (data.projects) set({ projects: data.projects });
      if (data.settings) set({ settings: { ...DEFAULT_SETTINGS, ...data.settings } });
    },

    initSamples: () => {
      const current = get().projects;
      if (current.some((p) => p.sample)) return;
      const samples = createSampleProjects();
      const next = [...samples, ...current];
      set({ projects: next });
      persistState(next, get().settings);
    },
  };
});
