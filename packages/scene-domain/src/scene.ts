import { CATALOG, newId } from './legacy/catalog';
import type { FurnitureItem, Project } from './legacy/types';
import { canonicalOpeningToRoom, getRoomOpenings, roomOpeningToCanonical } from './legacy/openings';
import {
  projectDocumentSchema,
  roomSceneSchema,
  type Capture,
  type Dimension,
  type Observation,
  type Opening,
  type PhysicalItem,
  type Placement,
  type ProjectDocument,
  type RoomScene,
} from './schema';

export const evidence = (
  meters: number,
  source: Dimension['source'] = 'placeholder',
  reviewed = false,
  evidenceIds: string[] = [],
): Dimension => ({ meters, source, reviewed, evidenceIds });
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function createDocument(
  name = 'My room',
  width = 5.2,
  depth = 4.2,
  height = 2.8,
): ProjectDocument {
  const now = new Date().toISOString(),
    layoutId = newId('layout');
  return projectDocumentSchema.parse({
    id: newId('room'),
    name,
    createdAt: now,
    updatedAt: now,
    favorite: false,
    sample: false,
    scene: {
      schemaVersion: 2,
      revision: 0,
      units: 'meters',
      floorPolygonXZ: [
        [0, 0],
        [width, 0],
        [width, depth],
        [0, depth],
      ],
      height: evidence(height),
      boundarySource: 'placeholder',
      dimensionEvidence: { width: evidence(width), depth: evidence(depth) },
      openings: [
        {
          id: newId('opening'),
          kind: 'door',
          wallIndex: 2,
          offsetM: Math.max(0, width - 0.45 - Math.min(0.9, width * 0.4)),
          widthM: Math.min(0.9, width * 0.4),
          heightM: Math.min(2.1, height * 0.84),
          sillHeightM: 0,
          source: 'placeholder',
          doorSwing: 'inward-start',
        },
      ],
      wallColor: '#EDE7DE',
      floorColor: '#C9A982',
      items: [],
      observations: [],
      captures: [],
      layouts: [
        {
          id: layoutId,
          name: 'Original layout',
          placements: [],
          createdAt: now,
        },
      ],
      activeLayoutId: layoutId,
    },
  });
}
export function newPhysicalItem(
  category: PhysicalItem['category'],
  name?: string,
): PhysicalItem {
  const entry = CATALOG.find((i) => i.type === category)!;
  return {
    id: newId(),
    name: name?.trim() || entry.name,
    category,
    observationIds: [],
    width: evidence(entry.width, 'category-prior'),
    depth: evidence(entry.depth, 'category-prior'),
    height: evidence(entry.height, 'category-prior'),
    mounting: entry.mounting ?? 'floor',
    elevationM: entry.elevationM ?? 0,
    representation: category === 'custom' ? 'custom-box' : 'procedural',
    color: entry.color,
    movable: true,
  };
}
export function activeLayout(scene: RoomScene) {
  return scene.layouts.find((l) => l.id === scene.activeLayoutId)!;
}
export function bounds(scene: Pick<RoomScene, 'floorPolygonXZ'>) {
  const xs = scene.floorPolygonXZ.map((p) => p[0]),
    zs = scene.floorPolygonXZ.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minZ: Math.min(...zs),
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...zs) - Math.min(...zs),
  };
}
export function legacyItem(
  item: PhysicalItem,
  placement?: Placement,
): FurnitureItem {
  return {
    id: item.id,
    type: item.category,
    name: item.name,
    width: item.width.meters,
    depth: item.depth.meters,
    height: item.height.meters,
    mounting: item.mounting ?? 'floor',
    elevationM: item.elevationM ?? 0,
    color: item.color,
    source: [item.width, item.depth, item.height].every((d) =>
      ['user-measured', 'product-specification'].includes(d.source),
    )
      ? 'measured'
      : [item.width, item.depth, item.height].some(
            (d) => d.source === 'placeholder',
          )
        ? 'sample'
        : 'estimated',
    x: placement?.floorCenterXM ?? 0,
    z: placement?.floorCenterZM ?? 0,
    rotation: placement
      ? ((((-placement.yawRad * 180) / Math.PI) % 360) + 360) % 360
      : 0,
    placed: !!placement,
    locked: placement?.locked ?? !item.movable,
  };
}
export function toLegacyProject(doc: ProjectDocument): Project {
  const scene = doc.scene,
    b = bounds(scene),
    layout = activeLayout(scene),
    openings = scene.openings.map((o) => canonicalOpeningToRoom(scene.floorPolygonXZ, o)),
    door = openings.find((o) => o.kind === 'door');
  return {
    id: doc.id,
    name: doc.name,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    favorite: doc.favorite,
    sample: doc.sample,
    room: {
      width: b.width,
      depth: b.depth,
      height: scene.height.meters,
      dimensionSources: {
        width: scene.dimensionEvidence.width?.source ?? scene.boundarySource,
        depth: scene.dimensionEvidence.depth?.source ?? scene.boundarySource,
        height: scene.height.source,
      },
      wallColor: scene.wallColor,
      floorColor: scene.floorColor,
      door: {
        wall: door?.wall ?? 'front',
        offset: door?.offset ?? 0.2,
        width: door?.width ?? 0.8,
      },
      openings,
    },
    items: scene.items.map((i) =>
      legacyItem(
        i,
        layout.placements.find((p) => p.physicalItemId === i.id),
      ),
    ),
    photos: [],
    layouts: scene.layouts.map((l) => ({
      id: l.id,
      name: l.name,
      createdAt: l.createdAt,
      items: scene.items.map((i) =>
        legacyItem(
          i,
          l.placements.find((p) => p.physicalItemId === i.id),
        ),
      ),
    })),
  };
}
export function migrateLegacyProject(project: Project): ProjectDocument {
  const doc = createDocument(
    project.name,
    project.room.width,
    project.room.depth,
    project.room.height,
  );
  doc.id = project.id;
  doc.createdAt = project.createdAt;
  doc.updatedAt = project.updatedAt;
  doc.favorite = project.favorite;
  doc.sample = project.sample;
  doc.scene.wallColor = project.room.wallColor;
  doc.scene.floorColor = project.room.floorColor;
  for (const name of ['width', 'depth'] as const) {
    const source = project.room.dimensionSources?.[name];
    if (source) doc.scene.dimensionEvidence[name] = evidence(project.room[name], source, source === 'user-measured');
  }
  if (project.room.dimensionSources?.height)
    doc.scene.height = evidence(project.room.height, project.room.dimensionSources.height, project.room.dimensionSources.height === 'user-measured');
  if (['width', 'depth'].every((name) => project.room.dimensionSources?.[name as 'width' | 'depth'] === 'user-measured'))
    doc.scene.boundarySource = 'user-measured';
  doc.scene.openings = getRoomOpenings(project.room)
    .map((opening) => roomOpeningToCanonical(project.room, opening));
  const current = new Map(project.items.map((i) => [i.id, i]));
  for (const l of project.layouts)
    for (const item of l.items)
      if (!current.has(item.id)) current.set(item.id, item);
  doc.scene.items = [...current.values()].map((i) => {
    const source: Dimension['source'] =
      i.source === 'measured'
        ? 'user-measured'
        : i.source === 'sample'
          ? 'placeholder'
          : 'category-prior';
    return {
      ...newPhysicalItem(i.type, i.name),
      id: i.id,
      color: i.color,
      width: evidence(i.width, source, source === 'user-measured'),
      depth: evidence(i.depth, source, source === 'user-measured'),
      height: evidence(i.height, source, source === 'user-measured'),
      mounting: i.mounting ?? 'floor',
      elevationM: i.elevationM ?? 0,
    };
  });
  const poses = (items: FurnitureItem[]) =>
    items
      .filter((i) => i.placed)
      .map((i) => ({
        physicalItemId: i.id,
        floorCenterXM: i.x,
        floorCenterZM: i.z,
        yawRad: (-(((i.rotation % 360) + 360) % 360) * Math.PI) / 180,
        locked: i.locked,
      }));
  doc.scene.layouts[0].placements = poses(project.items);
  doc.scene.layouts.push(
    ...project.layouts.slice(0, 29).map((l) => ({
      id: l.id,
      name: l.name,
      createdAt: l.createdAt,
      placements: poses(l.items),
    })),
  );
  doc.scene.captures = project.photos.map((p) => ({
    id: p.id,
    originalAssetId: `asset-${p.id}`,
    name: p.name,
    width: p.width,
    height: p.height,
    createdAt: project.createdAt,
    qualityWarnings: [],
    mapping: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
    ...(p.roomProposal ? { roomProposal: p.roomProposal } : {}),
    status:
      p.analysisStatus === 'running'
        ? 'failed'
        : p.analysisStatus === 'complete'
          ? 'review'
          : p.analysisStatus,
    error:
      p.analysisStatus === 'running'
        ? 'Previous analysis was interrupted.'
        : p.analysisMessage,
  }));
  doc.scene.observations = project.photos.flatMap((p) =>
    p.detections.map((d) => ({
      id: `${p.id}:${d.id}`.slice(0, 128),
      captureImageId: p.id,
      originalLabel: d.label,
      category: d.type,
      score: d.source === 'model' ? d.score : undefined,
      source: d.source,
      coordinateSpace: 'oriented-source-image' as const,
      boxPx: d.box,
      mask: { revision: 0, polygons: [], strokes: [], expansionPx: 0 },
      ignored: false,
      fixed: false,
      reviewed: false,
    })),
  );
  for (const item of project.items) {
    if (!item.detectionId) continue;
    const photo = project.photos.find(
      (p) =>
        (!item.photoId || p.id === item.photoId) &&
        p.detections.some((d) => d.id === item.detectionId),
    );
    const observation =
      photo &&
      doc.scene.observations.find(
        (o) => o.id === `${photo.id}:${item.detectionId}`.slice(0, 128),
      );
    if (observation)
      doc.scene.items
        .find((i) => i.id === item.id)!
        .observationIds.push(observation.id);
  }
  return projectDocumentSchema.parse(doc);
}
export type SceneCommand =
  | { type: 'add-item'; item: PhysicalItem }
  | { type: 'remove-item'; id: string }
  | {
      type: 'edit-item';
      id: string;
      changes: Partial<
        Pick<
          PhysicalItem,
          | 'name'
          | 'category'
          | 'width'
          | 'depth'
          | 'height'
          | 'mounting'
          | 'elevationM'
          | 'color'
          | 'representation'
        >
      >;
    }
  | { type: 'place'; placement: Placement }
  | { type: 'unplace'; id: string }
  | { type: 'lock'; id: string; locked: boolean }
  | { type: 'fixed'; id: string; fixed: boolean; placement?: Placement }
  | { type: 'duplicate'; id: string; newId?: string }
  | { type: 'save-layout'; name: string; id?: string }
  | { type: 'load-layout'; id: string }
  | { type: 'delete-layout'; id: string }
  | {
      type: 'room';
      changes: Partial<
        Pick<
          RoomScene,
          | 'floorPolygonXZ'
          | 'height'
          | 'boundarySource'
          | 'dimensionEvidence'
          | 'wallColor'
          | 'floorColor'
          | 'openings'
        >
      >;
    }
  | { type: 'opening'; opening: Opening }
  | { type: 'remove-opening'; id: string }
  | { type: 'add-capture'; capture: Capture }
  | { type: 'edit-capture'; id: string; changes: Partial<Capture> }
  | { type: 'remove-capture'; id: string }
  | { type: 'observation'; observation: Observation }
  | { type: 'extract'; observationId: string; itemId?: string }
  | { type: 'link-observation'; itemId: string; observationId: string }
  | { type: 'merge'; keepId: string; removeIds: string[] }
  | { type: 'split-observation'; itemId: string; observationId: string }
  | { type: 'empty-room' };
export type Outcome<T> =
  { ok: true; value: T; warnings?: string[] } | { ok: false; message: string };
export function applyCommand(
  current: RoomScene,
  command: SceneCommand,
): Outcome<RoomScene> {
  try {
    const s = clone(current),
      l = activeLayout(s),
      c = command;
    const item = (id: string) => {
      const i = s.items.find((i) => i.id === id);
      if (!i) throw new Error('This piece is no longer available.');
      return i;
    };
    const unlocked = (id: string) => {
      const i = item(id);
      if (
        !i.movable ||
        l.placements.find((p) => p.physicalItemId === id)?.locked
      )
        throw new Error(
          'Unlock this piece before changing its placement or dimensions.',
        );
      return i;
    };
    switch (c.type) {
      case 'add-item':
        s.items.push(c.item);
        break;
      case 'remove-item': {
        unlocked(c.id);
        s.items = s.items.filter((i) => i.id !== c.id);
        for (const layout of s.layouts)
          layout.placements = layout.placements.filter(
            (p) => p.physicalItemId !== c.id,
          );
        break;
      }
      case 'edit-item': {
        const i =
          'width' in c.changes || 'depth' in c.changes || 'height' in c.changes ||
          'mounting' in c.changes || 'elevationM' in c.changes
            ? unlocked(c.id)
            : item(c.id);
        Object.assign(i, c.changes);
        break;
      }
      case 'place': {
        unlocked(c.placement.physicalItemId);
        l.placements = l.placements.filter(
          (p) => p.physicalItemId !== c.placement.physicalItemId,
        );
        l.placements.push(c.placement);
        break;
      }
      case 'unplace':
        unlocked(c.id);
        l.placements = l.placements.filter((p) => p.physicalItemId !== c.id);
        break;
      case 'lock': {
        const i = item(c.id);
        if (!i.movable && !c.locked)
          throw new Error(
            'Change this fixture to movable furniture before unlocking it.',
          );
        const p = l.placements.find((p) => p.physicalItemId === c.id);
        if (p) p.locked = c.locked;
        break;
      }
      case 'fixed': {
        const i = item(c.id);
        i.movable = !c.fixed;
        if (c.fixed) {
          const p =
            c.placement ?? l.placements.find((p) => p.physicalItemId === c.id);
          if (!p) throw new Error('Place the fixture before marking it fixed.');
          for (const layout of s.layouts)
            layout.placements = [
              ...layout.placements.filter((p) => p.physicalItemId !== c.id),
              { ...p, locked: true },
            ];
        }
        break;
      }
      case 'duplicate': {
        const i = item(c.id),
          copy = {
            ...clone(i),
            id: c.newId ?? newId(),
            name: `${i.name.slice(0, 90)} (copy)`,
            movable: true,
            observationIds: [],
          };
        s.items.push(copy);
        break;
      }
      case 'save-layout':
        s.layouts.push({
          id: c.id ?? newId('layout'),
          name: c.name,
          createdAt: new Date().toISOString(),
          placements: clone(l.placements),
        });
        break;
      case 'load-layout':
        if (!s.layouts.some((l) => l.id === c.id))
          throw new Error('This layout is no longer available.');
        s.activeLayoutId = c.id;
        break;
      case 'delete-layout':
        if (s.layouts.length === 1)
          throw new Error('Keep at least one layout.');
        s.layouts = s.layouts.filter((l) => l.id !== c.id);
        if (s.activeLayoutId === c.id) s.activeLayoutId = s.layouts[0].id;
        break;
      case 'room':
        Object.assign(s, c.changes);
        break;
      case 'opening':
        s.openings = [
          ...s.openings.filter((o) => o.id !== c.opening.id),
          c.opening,
        ];
        break;
      case 'remove-opening':
        s.openings = s.openings.filter((o) => o.id !== c.id);
        break;
      case 'add-capture':
        s.captures.push(c.capture);
        break;
      case 'edit-capture': {
        const capture = s.captures.find((p) => p.id === c.id);
        if (!capture) throw new Error('This photo is no longer available.');
        Object.assign(capture, c.changes, { id: c.id });
        break;
      }
      case 'remove-capture': {
        s.captures = s.captures.filter((p) => p.id !== c.id);
        const removed = new Set(
          s.observations
            .filter((o) => o.captureImageId === c.id)
            .map((o) => o.id),
        );
        s.observations = s.observations.filter((o) => !removed.has(o.id));
        for (const i of s.items)
          i.observationIds = i.observationIds.filter((id) => !removed.has(id));
        break;
      }
      case 'observation':
        s.observations = [
          ...s.observations.filter((o) => o.id !== c.observation.id),
          c.observation,
        ];
        break;
      case 'extract': {
        const o = s.observations.find((o) => o.id === c.observationId);
        if (!o || o.ignored)
          throw new Error('Review a furniture observation first.');
        if (s.items.some((i) => i.observationIds.includes(o.id)))
          throw new Error('This observation is already in the inventory.');
        const i = newPhysicalItem(o.category, o.label ?? o.originalLabel);
        i.id = c.itemId ?? i.id;
        i.observationIds = [o.id];
        if (o.color) i.color = o.color;
        o.reviewed = true;
        s.items.push(i);
        break;
      }
      case 'link-observation': {
        const i = item(c.itemId),
          o = s.observations.find((o) => o.id === c.observationId);
        if (!o) throw new Error('This observation is no longer available.');
        if (
          s.items.some(
            (other) => other.id !== i.id && other.observationIds.includes(o.id),
          )
        )
          throw new Error(
            'This observation already belongs to a piece. Use merge to combine physical items.',
          );
        i.observationIds = [...new Set([...i.observationIds, o.id])];
        o.reviewed = true;
        break;
      }
      case 'merge': {
        const keep = item(c.keepId);
        const remove = c.removeIds.filter((id) => id !== c.keepId);
        for (const id of remove) {
          const i = unlocked(id);
          keep.observationIds = [
            ...new Set([...keep.observationIds, ...i.observationIds]),
          ];
        }
        s.items = s.items.filter((i) => !remove.includes(i.id));
        for (const layout of s.layouts)
          layout.placements = layout.placements.filter(
            (p) => !remove.includes(p.physicalItemId),
          );
        break;
      }
      case 'split-observation': {
        const i = item(c.itemId),
          o = s.observations.find((o) => o.id === c.observationId);
        if (!o || !i.observationIds.includes(o.id))
          throw new Error('Choose an observation linked to this piece.');
        i.observationIds = i.observationIds.filter((id) => id !== o.id);
        const copy = newPhysicalItem(o.category, o.label ?? o.originalLabel);
        copy.observationIds = [o.id];
        s.items.push(copy);
        break;
      }
      case 'empty-room':
        l.placements = l.placements.filter(
          (p) => !item(p.physicalItemId).movable || p.locked,
        );
        break;
    }
    s.revision = current.revision + 1;
    const result = roomSceneSchema.safeParse(s);
    if (!result.success)
      return {
        ok: false,
        message:
          result.error.issues[0]?.message ?? 'Please check the room details.',
      };
    return { ok: true, value: result.data };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'That change could not be applied. Your room is unchanged.',
    };
  }
}
export interface SceneHistory {
  past: RoomScene[];
  future: RoomScene[];
}
export function undoScene(
  scene: RoomScene,
  history: SceneHistory,
): Outcome<{ scene: RoomScene; history: SceneHistory }> {
  if (!history.past.length) return { ok: false, message: 'Nothing to undo.' };
  const previous = clone(history.past[history.past.length - 1]);
  previous.revision = scene.revision + 1;
  return {
    ok: true,
    value: {
      scene: previous,
      history: {
        past: history.past.slice(0, -1),
        future: [clone(scene), ...history.future].slice(0, 50),
      },
    },
  };
}
export function redoScene(
  scene: RoomScene,
  history: SceneHistory,
): Outcome<{ scene: RoomScene; history: SceneHistory }> {
  if (!history.future.length) return { ok: false, message: 'Nothing to redo.' };
  const next = clone(history.future[0]);
  next.revision = scene.revision + 1;
  return {
    ok: true,
    value: {
      scene: next,
      history: {
        past: [...history.past, clone(scene)].slice(-50),
        future: history.future.slice(1),
      },
    },
  };
}
