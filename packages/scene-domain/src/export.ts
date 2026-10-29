import { getCorners } from './legacy/geometry';
import { activeLayout, bounds, legacyItem } from './scene';
import type { ProjectDocument } from './schema';
import { getOpeningLeaf } from './openings';
export const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
export function dimensionedPlan(doc: ProjectDocument) {
  const s = doc.scene,
    b = bounds(s),
    scale = Math.min(800 / b.width, 650 / b.depth),
    polygon = s.floorPolygonXZ
      .map(([x, z]) => `${(x - b.minX) * scale},${(z - b.minZ) * scale}`)
      .join(' ');
  const items = activeLayout(s)
    .placements.map((p) => {
      const i = s.items.find((i) => i.id === p.physicalItemId)!;
      return `<polygon points="${getCorners(legacyItem(i, p))
        .map((q) => `${(q.x - b.minX) * scale},${(q.z - b.minZ) * scale}`)
        .join(
          ' ',
        )}" fill="${xml(i.color)}" fill-opacity=".65" stroke="#3e6658"/><text x="${(p.floorCenterXM - b.minX) * scale}" y="${(p.floorCenterZM - b.minZ) * scale}" text-anchor="middle" font-size="11">${xml(i.name)}</text>`;
    })
    .join('');
  const xy = ([x, z]: [number, number]) => `${(x - b.minX) * scale},${(z - b.minZ) * scale}`;
  const openings = s.openings.map((opening) => {
    const leaf = getOpeningLeaf(s.floorPolygonXZ, opening),
      color = opening.kind === 'door' ? '#866448' : '#4b94a8',
      closedTip = leaf.hingeSide === 'start' ? leaf.closedEnd : leaf.closedStart,
      startVector = [closedTip[0] - leaf.hinge[0], closedTip[1] - leaf.hinge[1]],
      endVector = [leaf.end[0] - leaf.hinge[0], leaf.end[1] - leaf.hinge[1]],
      sweep = startVector[0] * endVector[1] - startVector[1] * endVector[0] >= 0 ? 1 : 0,
      arc = leaf.openAngleDeg > 0 ? `<path d="M${xy(closedTip)} A${opening.widthM * scale},${opening.widthM * scale} 0 0 ${sweep} ${xy(leaf.end)}" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="3 3"/>` : '';
    return `<g data-opening-id="${xml(opening.id)}"><title>${opening.kind} · ${opening.widthM} × ${opening.heightM} m · sill ${opening.sillHeightM} m · ${leaf.openAngleDeg}° ${leaf.swingDirection}</title><path d="M${xy(leaf.closedStart)} L${xy(leaf.closedEnd)}" stroke="white" stroke-width="8"/><path d="M${xy(leaf.closedStart)} L${xy(leaf.closedEnd)}" stroke="${color}" stroke-width="${opening.kind === 'window' ? 3 : 1}"/><polygon points="${leaf.footprint.map(xy).join(' ')}" fill="${color}" stroke="${color}" stroke-width="1"/>${arc}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${b.width * scale + 120}" height="${b.depth * scale + 140}" viewBox="-60 -70 ${b.width * scale + 120} ${b.depth * scale + 140}"><rect x="-60" y="-70" width="100%" height="100%" fill="#faf9f6"/><g font-family="sans-serif" fill="#26382d"><text x="0" y="-40" font-size="20">${xml(doc.name)}</text><text x="${(b.width * scale) / 2}" y="-12" font-size="13" text-anchor="middle">${b.width.toFixed(2)} m</text><polygon points="${polygon}" fill="white" stroke="#26382d" stroke-width="3"/>${items}${openings}<text x="-20" y="${(b.depth * scale) / 2}" font-size="13" transform="rotate(-90 -20 ${(b.depth * scale) / 2})" text-anchor="middle">${b.depth.toFixed(2)} m</text><text x="0" y="${b.depth * scale + 35}" font-size="11">AuraSpace · Height ${s.height.meters} m · Verify estimated dimensions before use</text></g></svg>`;
}
export function referencedAssets(doc: ProjectDocument) {
  return [
    ...new Set(
      [
        ...doc.scene.captures.flatMap((c) => [
          c.originalAssetId,
          c.analysisAssetId,
          c.previewAssetId,
          ...(c.processingAssets ?? []).map((a) => a.assetId),
        ]),
        ...doc.scene.observations.flatMap((o) => [
          o.thumbnailAssetId,
          o.mask.artifactId,
          o.rawMaskAssetId,
        ]),
      ].filter((id): id is string => !!id),
    ),
  ];
}
