import type {
  CatalogEntry,
  FurnitureItem,
  FurnitureType,
  Project,
  Room,
  Settings,
} from './types';

export const CATALOG: CatalogEntry[] = [
  {
    type: 'sofa',
    name: 'Linen sofa',
    description: 'A soft place to land. Three seats, endless possibilities.',
    width: 2.1,
    depth: 0.9,
    height: 0.82,
    color: '#8C9D88',
  },
  {
    type: 'chair',
    name: 'Lounge chair',
    description: 'A comfortable corner, all your own.',
    width: 0.78,
    depth: 0.8,
    height: 0.86,
    color: '#C9977D',
  },
  {
    type: 'table',
    name: 'Coffee table',
    description: 'Warm wood and a little everyday gathering space.',
    width: 1.1,
    depth: 0.6,
    height: 0.42,
    color: '#B58A60',
  },
  {
    type: 'bed',
    name: 'Platform bed',
    description: 'A generous double bed with a simple upholstered headboard.',
    width: 1.6,
    depth: 2.1,
    height: 0.95,
    color: '#C9B9A5',
  },
  {
    type: 'cabinet',
    name: 'Low sideboard',
    description: 'Keep your favorite things close, and the clutter away.',
    width: 1.4,
    depth: 0.42,
    height: 0.7,
    color: '#A7835E',
  },
  {
    type: 'plant',
    name: 'Indoor plant',
    description: 'A little green makes a room feel alive.',
    width: 0.45,
    depth: 0.45,
    height: 1.35,
    color: '#557761',
  },
  {
    type: 'rug',
    name: 'Woven rug',
    description: 'An easy way to bring the whole room together.',
    width: 2.3,
    depth: 1.7,
    height: 0.015,
    color: '#D6C5AA',
  },
  {
    type: 'custom',
    name: 'Custom object',
    description: 'Give anything a place. You set the dimensions.',
    width: 0.8,
    depth: 0.6,
    height: 0.8,
    color: '#A4A8B8',
  },
];

export const DEFAULT_SETTINGS: Settings = {
  displayName: 'Your studio',
  units: 'cm',
  snap: true,
  showGrid: true,
  reduceMotion: false,
  onboardingSeen: false,
};

export function newId(prefix = 'item'): string {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

export function makeItem(
  type: FurnitureType,
  overrides: Partial<FurnitureItem> = {},
): FurnitureItem {
  const entry =
    CATALOG.find((candidate) => candidate.type === type) ??
    CATALOG[CATALOG.length - 1]!;
  return {
    id: newId(),
    type: entry.type,
    name: entry.name,
    width: entry.width,
    depth: entry.depth,
    height: entry.height,
    color: entry.color,
    source: 'estimated',
    x: 0,
    z: 0,
    rotation: 0,
    placed: false,
    locked: false,
    ...overrides,
  };
}

export function makeRoom(width = 5.2, depth = 4.2, height = 2.8): Room {
  return {
    width,
    depth,
    height,
    wallColor: '#EDE7DE',
    floorColor: '#C9A982',
    door: {
      wall: 'front',
      offset: Math.min(0.45, width * 0.1),
      width: Math.min(0.9, width * 0.4),
    },
  };
}

export function makeProject(
  name = 'Untitled room',
  width = 5.2,
  depth = 4.2,
  height = 2.8,
): Project {
  const now = new Date().toISOString();
  return {
    id: newId('room'),
    name: name.trim() || 'Untitled room',
    room: makeRoom(width, depth, height),
    items: [],
    photos: [],
    layouts: [],
    createdAt: now,
    updatedAt: now,
    favorite: false,
    sample: false,
  };
}

function sampleItem(
  id: string,
  type: FurnitureType,
  x: number,
  z: number,
  overrides: Partial<FurnitureItem> = {},
) {
  return makeItem(type, {
    id,
    x,
    z,
    placed: true,
    source: 'sample',
    ...overrides,
  });
}

function createSamples(): Project[] {
  const living = makeProject('Sunday living', 5.2, 4.2, 2.8);
  living.id = 'sample-living';
  living.sample = true;
  living.favorite = true;
  living.cover = 'living';
  living.items = [
    sampleItem('sample-living-sofa', 'sofa', 2.5, 0.75),
    sampleItem('sample-living-chair', 'chair', 4.35, 2.15, { rotation: -32 }),
    sampleItem('sample-living-table', 'table', 2.55, 2),
    sampleItem('sample-living-rug', 'rug', 2.7, 1.85),
    sampleItem('sample-living-plant', 'plant', 0.45, 0.45),
    sampleItem('sample-living-cabinet', 'cabinet', 2.9, 3.83),
  ];
  const bedroom = makeProject('A slower morning', 4.3, 4.5, 2.7);
  bedroom.id = 'sample-bedroom';
  bedroom.sample = true;
  bedroom.cover = 'bedroom';
  bedroom.room = {
    ...bedroom.room,
    wallColor: '#E7E5DA',
    floorColor: '#D4B797',
  };
  bedroom.items = [
    sampleItem('sample-bedroom-bed', 'bed', 2.2, 1.3),
    sampleItem('sample-bedroom-chair', 'chair', 3.62, 3.35, {
      rotation: -20,
      color: '#BCAA99',
    }),
    sampleItem('sample-bedroom-table', 'table', 0.55, 0.75, {
      name: 'Bedside table',
      width: 0.45,
      depth: 0.45,
      height: 0.48,
    }),
    sampleItem('sample-bedroom-rug', 'rug', 2.2, 2.2, {
      color: '#D2CBBE',
      width: 2.5,
      depth: 2,
    }),
    sampleItem('sample-bedroom-plant', 'plant', 3.8, 0.45),
    sampleItem('sample-bedroom-cabinet', 'cabinet', 2.1, 4.1, { width: 1.6 }),
  ];
  return [living, bedroom];
}

export const sampleProjects: Project[] = createSamples();
export const createSampleProjects = (): Project[] =>
  JSON.parse(JSON.stringify(sampleProjects)) as Project[];
