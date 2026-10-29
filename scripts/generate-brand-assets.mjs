// Static exports of the code-native SVG mark. No server or network calls.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import React from 'react';
import { ImageResponse } from 'next/og.js';

const mark = await readFile(new URL('../app/icon.svg', import.meta.url), 'utf8');
const svgData = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const node = React.createElement;
const png = async (element, width, height = width) => Buffer.from(await new ImageResponse(element, { width, height }).arrayBuffer());
const icon = (size, maskable = false) => node('img', {
  src: svgData(maskable ? mark.replace('rx="16"', 'rx="0"') : mark),
  width: size, height: size,
});
await mkdir(new URL('../public/icons/', import.meta.url), { recursive: true });
for (const size of [192, 512])
  await writeFile(new URL(`../public/icons/icon-${size}.png`, import.meta.url), await png(icon(size), size));
await writeFile(new URL('../public/icons/maskable-512.png', import.meta.url), await png(icon(512, true), 512));
await writeFile(new URL('../app/apple-icon.png', import.meta.url), await png(icon(180, true), 180));

// ICO directory with PNG frames, including a 48px frame for search results.
const sizes = [16, 32, 48], frames = [];
for (const size of sizes) frames.push(await png(icon(size), size));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
frames.forEach((frame, i) => {
  const entry = 6 + i * 16;
  header[entry] = sizes[i]; header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(new URL('../app/favicon.ico', import.meta.url), Buffer.concat([header, ...frames]));

const plan = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="460" viewBox="0 0 460 460">
  <rect x="24" y="24" width="412" height="412" rx="26" fill="#ebe9df"/>
  <g stroke="#d6d9ce" stroke-width="1">
    ${Array.from({ length: 9 }, (_, i) => `<path d="M${50 + i * 45} 45v370M45 ${50 + i * 45}h370"/>`).join('')}
  </g>
  <path d="M145 44H44v372h372V44H250" fill="none" stroke="#3e6658" stroke-width="13" stroke-linecap="square"/>
  <path d="M145 44v88a88 88 0 0 0 88-88" fill="none" stroke="#8db5a5" stroke-width="3"/>
  <rect x="76" y="174" width="190" height="186" rx="24" fill="#f9f6ee" stroke="#ded8ca" stroke-width="2"/>
  <rect x="78" y="214" width="55" height="128" rx="12" fill="#b77960"/>
  <rect x="87" y="223" width="38" height="52" rx="7" fill="#d4a58b"/>
  <rect x="87" y="283" width="38" height="50" rx="7" fill="#d4a58b"/>
  <rect x="148" y="235" width="82" height="78" rx="20" fill="#d6bc93" stroke="#b59b76" stroke-width="3"/>
  <rect x="163" y="250" width="52" height="48" rx="13" fill="#e6d4b8"/>
  <rect x="304" y="89" width="73" height="112" rx="9" fill="#8db5a5"/>
  <rect x="315" y="99" width="51" height="92" rx="5" fill="#b8d1c7"/>
  <rect x="324" y="226" width="55" height="100" rx="8" fill="#d6bc93"/>
  <rect x="335" y="237" width="33" height="44" rx="4" fill="#f9f6ee"/>
  <circle cx="349" cy="366" r="23" fill="#b8d1c7"/>
  <path d="M349 381v-30m0 12-13-8m13 3 12-12" fill="none" stroke="#3e6658" stroke-width="5" stroke-linecap="round"/>
  <path d="M416 274v81" stroke="#c9977d" stroke-width="8"/>
  <path d="M405 274v81" stroke="#faf9f6" stroke-width="3"/>
</svg>`;

const card = node('div', { style: { display: 'flex', width: '100%', height: '100%', background: '#faf9f6', color: '#22332f', fontFamily: 'sans-serif', padding: '58px 64px', position: 'relative' } },
  node('div', { style: { display: 'flex', flexDirection: 'column', width: '56%', justifyContent: 'space-between' } },
    node('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
      node('img', { src: svgData(mark), width: 52, height: 52 }),
      node('div', { style: { fontSize: 34, fontWeight: 700, letterSpacing: -1 } }, 'AuraSpace')),
    node('div', { style: { display: 'flex', flexDirection: 'column', marginTop: -6 } },
      node('div', { style: { fontSize: 64, fontWeight: 700, lineHeight: 1.08, letterSpacing: -3 } }, 'Make room for possibility.'),
      node('div', { style: { fontSize: 23, lineHeight: 1.5, color: '#575e54', marginTop: 24, maxWidth: 460 } }, 'Design your space before you move a thing.')),
    node('div', { style: { fontSize: 17, color: '#3e6658', letterSpacing: 3, fontWeight: 700 } }, 'PLAN · ARRANGE · VISUALIZE')),
  node('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '44%', paddingLeft: 18 } },
    node('img', { src: svgData(plan), width: 440, height: 440 }),
    node('div', { style: { fontSize: 17, color: '#575e54', marginTop: 14 } }, 'Your room. Every possibility.')));
await writeFile(new URL('../public/og-image.png', import.meta.url), await png(card, 1200, 630));
console.log('Generated favicon, Apple touch icon, home-screen icons and 1200×630 sharing image.');
