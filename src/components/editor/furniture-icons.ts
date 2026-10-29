import type { FurnitureType } from '@/domain/types';

export const typeEmoji: Record<FurnitureType, string> = {
  sofa: '🛋️',
  chair: '🪑',
  bed: '🛏️',
  table: '☕',
  cabinet: '🗄️',
  plant: '🌿',
  rug: '🟫',
  custom: '📦',
  wardrobe: '🚪',
  'dressing-table': '🪞',
  mirror: '🪞',
  'air-conditioner': '❄️',
  'ceiling-fan': '🌀',
  desk: '✍️',
  'bedside-table': '🛎️',
  bookshelf: '📚',
  'shoe-rack': '👟',
  'tv-unit': '📺',
  fridge: '🧊',
};

export const furnitureGroups = {
  All: [],
  Bedroom: ['bed', 'wardrobe', 'dressing-table', 'mirror', 'bedside-table', 'air-conditioner', 'ceiling-fan'],
  Living: ['sofa', 'chair', 'table', 'rug', 'plant', 'tv-unit', 'bookshelf', 'mirror', 'air-conditioner', 'ceiling-fan'],
  Study: ['desk', 'chair', 'table', 'bookshelf'],
  Storage: ['wardrobe', 'cabinet', 'bookshelf', 'shoe-rack', 'tv-unit', 'bedside-table'],
  Appliances: ['air-conditioner', 'ceiling-fan', 'fridge'],
} satisfies Record<string, FurnitureType[]>;

export type FurnitureGroup = keyof typeof furnitureGroups;

const searchAliases: Partial<Record<FurnitureType, string>> = {
  sofa: 'couch settee diwan divan seating',
  chair: 'seat dining chair armchair',
  bed: 'double single cot charpai palang',
  table: 'coffee centre center dining tea table',
  cabinet: 'cupboard storage drawers chest',
  plant: 'pot potted indoor greenery',
  rug: 'carpet mat floor covering',
  wardrobe: 'almirah almira almari cupboard clothes closet',
  'dressing-table': 'dresser vanity makeup dressing mirror',
  mirror: 'looking glass wall mirror',
  'air-conditioner': 'ac a c split ac aircon airconditioner cooling unit',
  'ceiling-fan': 'fan pankha ceiling ventilation',
  desk: 'study table work writing office computer laptop',
  'bedside-table': 'nightstand night stand side table end table',
  bookshelf: 'bookcase book shelf books shelves rack',
  'shoe-rack': 'shoe stand footwear rack storage',
  'tv-unit': 'tv television console entertainment stand cabinet',
  fridge: 'refrigerator freezer icebox kitchen',
};

export function matchesFurniture(
  type: FurnitureType,
  name: string,
  query: string,
  group: FurnitureGroup,
) {
  if (group !== 'All' && !(furnitureGroups[group] as FurnitureType[]).includes(type)) return false;
  const words = `${name} ${type} ${searchAliases[type] ?? ''}`.toLowerCase().split(/[\s/,-]+/);
  return query.toLowerCase().trim().split(/[\s/,-]+/).filter(Boolean)
    .every((queryWord) => words.some((word) => word.startsWith(queryWord)));
}
