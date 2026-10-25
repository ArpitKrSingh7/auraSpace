import {
  applyCommand,
  clone,
  createDocument,
  projectDocumentSchema,
  redoScene,
  undoScene,
  type ProjectDocument,
  type SceneCommand,
  type SceneHistory,
} from '@auraspace/scene-domain';
import { create } from 'zustand';
import {
  listDocuments,
  preference,
  projectMedia,
  removeDocument,
  saveDocument,
  setPreference,
} from '../storage/database';
import { deleteMediaFile } from '../storage/media';
interface StudioState {
  ready: boolean;
  projects: ProjectDocument[];
  notice: string | null;
  endpoint: string;
  dirtyIds: string[];
  savedAt: string | null;
  history: Record<string, SceneHistory>;
  initialize: () => Promise<void>;
  notify: (message: string | null) => void;
  createRoom: (
    name: string,
    width: number,
    depth: number,
    height: number,
  ) => Promise<string | null>;
  execute: (projectId: string, command: SceneCommand) => boolean;
  undo: (id: string) => void;
  redo: (id: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => Promise<void>;
  put: (document: ProjectDocument) => Promise<boolean>;
  setEndpoint: (url: string) => Promise<boolean>;
  flush: () => Promise<void>;
}
let writes: Promise<void> = Promise.resolve();
function persist(doc: ProjectDocument) {
  writes = writes
    .catch(() => undefined)
    .then(async () => {
      try {
        await saveDocument(doc);
        useStudio.setState((s) => ({
          dirtyIds:
            s.projects.find((p) => p.id === doc.id)?.scene.revision ===
            doc.scene.revision
              ? s.dirtyIds.filter((id) => id !== doc.id)
              : s.dirtyIds,
          savedAt: new Date().toISOString(),
        }));
      } catch {
        useStudio
          .getState()
          .notify(
            'Device storage could not save this change. Keep the app open, retry saving, or export a backup.',
          );
      }
    });
}
export const useStudio = create<StudioState>((set, get) => ({
  ready: false,
  projects: [],
  notice: null,
  endpoint: '',
  dirtyIds: [],
  savedAt: null,
  history: {},
  initialize: async () => {
    try {
      const { projects, hasUnreadable } = await listDocuments();
      set({
        projects,
        endpoint:
          (await preference('api-endpoint')) ??
          process.env.EXPO_PUBLIC_API_URL ??
          '',
        ready: true,
        notice: hasUnreadable
          ? 'A saved file needs recovery. It has been preserved on this device.'
          : null,
      });
    } catch {
      set({
        ready: true,
        notice:
          'Local storage is temporarily unavailable. Retry opening the studio; existing files have not been removed.',
      });
    }
  },
  notify: (notice) => set({ notice }),
  createRoom: async (name, width, depth, height) => {
    try {
      const doc = createDocument(name, width, depth, height);
      await saveDocument(doc);
      set((s) => ({ projects: [doc, ...s.projects] }));
      return doc.id;
    } catch {
      get().notify(
        'Check the room name and dimensions, or free some device storage.',
      );
      return null;
    }
  },
  execute: (id, command) => {
    const doc = get().projects.find((p) => p.id === id);
    if (!doc) return false;
    const result = applyCommand(doc.scene, command);
    if (!result.ok) {
      get().notify(result.message);
      return false;
    }
    const next = {
      ...doc,
      scene: result.value,
      updatedAt: new Date().toISOString(),
    };
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? next : p)),
      history: {
        ...s.history,
        [id]: {
          past: [...(s.history[id]?.past ?? []), clone(doc.scene)].slice(-50),
          future: [],
        },
      },
      dirtyIds: [...new Set([...s.dirtyIds, id])],
    }));
    persist(next);
    return true;
  },
  undo: (id) => {
    const doc = get().projects.find((p) => p.id === id);
    if (!doc) return;
    const result = undoScene(
      doc.scene,
      get().history[id] ?? { past: [], future: [] },
    );
    if (!result.ok) return;
    const next = {
      ...doc,
      scene: result.value.scene,
      updatedAt: new Date().toISOString(),
    };
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? next : p)),
      history: { ...s.history, [id]: result.value.history },
      dirtyIds: [...new Set([...s.dirtyIds, id])],
    }));
    persist(next);
  },
  redo: (id) => {
    const doc = get().projects.find((p) => p.id === id);
    if (!doc) return;
    const result = redoScene(
      doc.scene,
      get().history[id] ?? { past: [], future: [] },
    );
    if (!result.ok) return;
    const next = {
      ...doc,
      scene: result.value.scene,
      updatedAt: new Date().toISOString(),
    };
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? next : p)),
      history: { ...s.history, [id]: result.value.history },
      dirtyIds: [...new Set([...s.dirtyIds, id])],
    }));
    persist(next);
  },
  rename: (id, name) => {
    const doc = get().projects.find((p) => p.id === id);
    if (!doc) return;
    const safe = name.trim().slice(0, 100);
    if (!safe) return;
    const next = { ...doc, name: safe, updatedAt: new Date().toISOString() };
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? next : p)),
      dirtyIds: [...new Set([...s.dirtyIds, id])],
    }));
    persist(next);
  },
  remove: async (id) => {
    try {
      await get().flush();
      const records = await projectMedia(id);
      await removeDocument(id);
      for (const m of records) {
        try {
          deleteMediaFile(m);
        } catch {
          get().notify(
            'The room was deleted. Some unused photo files could not be removed from device storage.',
          );
        }
      }
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        dirtyIds: s.dirtyIds.filter((i) => i !== id),
      }));
    } catch {
      get().notify('This room could not be deleted. Please retry.');
    }
  },
  put: async (input) => {
    try {
      const doc = projectDocumentSchema.parse(input);
      await saveDocument(doc);
      set((s) => ({
        projects: [doc, ...s.projects.filter((p) => p.id !== doc.id)],
      }));
      return true;
    } catch {
      get().notify(
        'This project could not be opened. Your existing rooms are unchanged.',
      );
      return false;
    }
  },
  setEndpoint: async (raw) => {
    try {
      const url = raw.trim().replace(/\/$/, '');
      if (url) {
        const parsed = new URL(url);
        if (
          !['https:', 'http:'].includes(parsed.protocol) ||
          parsed.username ||
          parsed.password
        )
          throw new Error();
      }
      await setPreference('api-endpoint', url);
      set({ endpoint: url });
      return true;
    } catch {
      get().notify(
        'Enter a valid http or https server address, or leave it empty for offline planning.',
      );
      return false;
    }
  },
  flush: async () => {
    await writes;
    for (const id of get().dirtyIds) {
      const doc = get().projects.find((p) => p.id === id);
      if (doc) {
        await saveDocument(doc);
        set((s) => ({
          dirtyIds: s.dirtyIds.filter((i) => i !== id),
          savedAt: new Date().toISOString(),
        }));
      }
    }
  },
}));
