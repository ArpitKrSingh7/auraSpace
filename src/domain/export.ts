import type { Project } from './types';
import { getCorners } from './geometry';

const escape = (text: string) =>
  text.replace(
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
export function exportPlanSvg(project: Project): string {
  const { room } = project;
  const scale = Math.min(800 / room.width, 650 / room.depth);
  const w = room.width * scale,
    d = room.depth * scale;
  const shapes = project.items
    .filter((i) => i.placed)
    .sort((a, b) => Number(b.type === 'rug') - Number(a.type === 'rug'))
    .map(
      (item) =>
        `<polygon points="${getCorners(item)
          .map((p) => `${p.x * scale},${p.z * scale}`)
          .join(
            ' ',
          )}" fill="${escape(item.color)}" fill-opacity=".65" stroke="#325248"/><text x="${item.x * scale}" y="${item.z * scale}" text-anchor="middle" font-size="11">${escape(item.name)}</text>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 120}" height="${d + 150}" viewBox="-60 -80 ${w + 120} ${d + 150}"><rect x="-60" y="-80" width="${w + 120}" height="${d + 150}" fill="#faf9f6"/><g font-family="sans-serif" fill="#293f3a"><text x="0" y="-50" font-size="20">${escape(project.name)}</text><text x="${w / 2}" y="-15" text-anchor="middle" font-size="13">${room.width} m</text><rect width="${w}" height="${d}" fill="white" stroke="#293f3a" stroke-width="4"/>${shapes}<text transform="translate(-20 ${d / 2}) rotate(-90)" text-anchor="middle" font-size="13">${room.depth} m</text><text x="0" y="${d + 35}" font-size="11">AuraSpace · ${room.width} × ${room.depth} m · Height ${room.height} m · Check estimated dimensions before use</text></g></svg>`;
}
export function downloadFile(
  content: BlobPart,
  filename: string,
  type: string,
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
