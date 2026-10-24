import React, { useEffect, useMemo } from 'react';
import { Color, MathUtils } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { FurnitureItem } from '../../domain/types';

function Rounded({ size, at = [0, 0, 0], color, radius = 0.045, opacity = 1 }: {
  size: [number, number, number]; at?: [number, number, number]; color: string; radius?: number; opacity?: number;
}) {
  const geometry = useMemo(() => new RoundedBoxGeometry(...size, 3, Math.min(radius, ...size.map(v => v / 3))), [size[0], size[1], size[2], radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh position={at} geometry={geometry} castShadow receiveShadow>
    <meshStandardMaterial color={color} roughness={0.87} transparent={opacity < 1} opacity={opacity} />
  </mesh>;
}

function Leg({ x, z, height = 0.18, radius = 0.027, color = '#715541' }: { x: number; z: number; height?: number; radius?: number; color?: string }) {
  return <mesh position={[x, height / 2, z]} castShadow><cylinderGeometry args={[radius * .82, radius, height, 8]} /><meshStandardMaterial color={color} roughness={.65} /></mesh>;
}

function Feet({ width, depth, height = .18, inset = .11, color }: { width: number; depth: number; height?: number; inset?: number; color?: string }) {
  return <>{[-1, 1].flatMap(x => [-1, 1].map(z => <Leg key={`${x},${z}`} x={x * (width / 2 - inset)} z={z * (depth / 2 - inset)} height={height} color={color} />))}</>;
}

function Sofa({ item, opacity }: { item: FurnitureItem; opacity: number }) {
  const { width: w, depth: d, height: h, color } = item;
  const light = `#${new Color(color).lerp(new Color('#ffffff'), .12).getHexString()}`;
  const seat = Math.min(.43, h * .5), arm = Math.min(.16, w * .12);
  return <>
    <Feet width={w} depth={d} height={h * .14} />
    <Rounded size={[w, h * .2, d]} at={[0, h * .24, 0]} color={color} opacity={opacity} />
    <Rounded size={[w, h * .62, Math.max(.1, d * .2)]} at={[0, h * .67, -d * .4]} color={color} opacity={opacity} radius={.08} />
    {[-1, 1].map(side => <Rounded key={side} size={[arm, h * .52, d * .94]} at={[side * (w - arm) / 2, h * .48, .01]} color={color} opacity={opacity} radius={.06} />)}
    {Array.from({ length: w > 1.7 ? 3 : 2 }, (_, i) => {
      const count = w > 1.7 ? 3 : 2, cushionW = (w - arm * 2 - .06) / count;
      return <Rounded key={i} size={[cushionW - .022, Math.max(.09, h * .14), d * .69]} at={[-(w - arm * 2 - .06) / 2 + cushionW * (i + .5), seat, d * .08]} color={light} opacity={opacity} radius={.06} />;
    })}
    <group position={[-w * .32, h * .65, -d * .22]} rotation={[0, .12, -.16]}>
      <Rounded size={[w * .17, h * .36, .13]} color="#e8ddd0" opacity={opacity} radius={.06} />
    </group>
  </>;
}

function Chair({ item, opacity }: { item: FurnitureItem; opacity: number }) {
  const { width: w, depth: d, height: h, color } = item;
  return <>
    <Feet width={w} depth={d} height={h * .43} inset={Math.min(w, d) * .16} />
    <Rounded size={[w, h * .15, d * .94]} at={[0, h * .46, 0]} color={color} opacity={opacity} radius={.065} />
    <group position={[0, h * .75, -d * .4]} rotation={[-.1, 0, 0]}><Rounded size={[w * .91, h * .48, d * .17]} color={color} opacity={opacity} radius={.07} /></group>
    {[-1, 1].map(side => <Rounded key={side} size={[w * .11, h * .25, d * .76]} at={[side * w * .45, h * .59, -.025]} color={color} opacity={opacity} />)}
  </>;
}

function Bed({ item, opacity }: { item: FurnitureItem; opacity: number }) {
  const { width: w, depth: d, height: h, color } = item;
  return <>
    <Feet width={w} depth={d} height={.13} />
    <Rounded size={[w, h * .27, d]} at={[0, h * .24, 0]} color="#a58a70" opacity={opacity} />
    <Rounded size={[w * .99, h * .24, d * .98]} at={[0, h * .48, 0]} color="#f7f1e7" opacity={opacity} radius={.08} />
    <Rounded size={[w * 1.01, h, .12]} at={[0, h / 2, -d * .47]} color={color} opacity={opacity} radius={.06} />
    <Rounded size={[w, .055, d * .58]} at={[0, h * .625, d * .19]} color={color} opacity={opacity} radius={.018} />
    {[-1, 1].map(side => <Rounded key={side} size={[w * .4, .1, d * .23]} at={[side * w * .24, h * .66, -d * .3]} color="#fffaf0" opacity={opacity} radius={.07} />)}
    <Rounded size={[w * 1.015, .065, d * .18]} at={[0, h * .68, d * .35]} color="#d2b49a" opacity={opacity} radius={.01} />
  </>;
}

function Table({ item, opacity }: { item: FurnitureItem; opacity: number }) {
  const { width: w, depth: d, height: h, color } = item;
  return <>
    <Feet width={w} depth={d} height={Math.max(.07, h - .07)} inset={Math.min(w, d) * .2} color={color} />
    <Rounded size={[w, Math.min(.08, h * .2), d]} at={[0, h - Math.min(.04, h * .1), 0]} color={color} opacity={opacity} radius={.055} />
    <mesh position={[w * .21, h + .006, -d * .12]} rotation={[-Math.PI / 2, 0, .15]}><planeGeometry args={[w * .23, d * .32]} /><meshStandardMaterial color="#e6d9c6" roughness={1} transparent={opacity < 1} opacity={opacity} /></mesh>
    <mesh position={[-w * .15, h + .055, -.025]} castShadow><cylinderGeometry args={[.055, .04, .1, 16]} /><meshStandardMaterial color="#d3b59b" roughness={.8} /></mesh>
  </>;
}

function Cabinet({ item, opacity }: { item: FurnitureItem; opacity: number }) {
  const { width: w, depth: d, height: h, color } = item;
  return <>
    <Feet width={w} depth={d} height={h * .12} />
    <Rounded size={[w, h * .88, d]} at={[0, h * .56, 0]} color={color} opacity={opacity} radius={.025} />
    {[-1, 1].map(side => <group key={side}>
      <Rounded size={[w * .48, h * .79, .018]} at={[side * w * .25, h * .56, d / 2 + .005]} color={color} opacity={opacity} radius={.004} />
      <Rounded size={[.016, h * .13, .025]} at={[side * w * .07, h * .58, d / 2 + .023]} color="#d7c298" opacity={opacity} radius={.003} />
    </group>)}
  </>;
}

function Plant({ item, opacity }: { item: FurnitureItem; opacity: number }) {
  const { width: w, depth: d, height: h, color } = item;
  const radius = Math.min(w, d) * .29;
  return <>
    <mesh position={[0, h * .16, 0]} castShadow receiveShadow><cylinderGeometry args={[radius, radius * .75, h * .32, 24]} /><meshStandardMaterial color="#c79877" roughness={.88} transparent={opacity < 1} opacity={opacity} /></mesh>
    <mesh position={[0, h * .323, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[radius * .92, 24]} /><meshStandardMaterial color="#5c4937" /></mesh>
    <mesh position={[0, h * .54, 0]}><cylinderGeometry args={[.012, .019, h * .51, 8]} /><meshStandardMaterial color="#685b3c" /></mesh>
    {Array.from({ length: 9 }, (_, i) => {
      const angle = i * 2.399, reach = .22 + (i % 3) * .075;
      return <mesh key={i} position={[Math.sin(angle) * w * reach, h * (.52 + (i % 4) * .105), Math.cos(angle) * d * reach]} rotation={[.35, angle, .4]} scale={[w * .23, h * .18, d * .11]} castShadow>
        <sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color={new Color(color).offsetHSL(0, -.03, (i % 3) * .035)} roughness={.9} transparent={opacity < 1} opacity={opacity} />
      </mesh>;
    })}
  </>;
}

function Rug({ item, opacity }: { item: FurnitureItem; opacity: number }) {
  const { width: w, depth: d, color } = item;
  const detail = `#${new Color(color).lerp(new Color('#f7f3e9'), .23).getHexString()}`;
  return <>
    <Rounded size={[w, .016, d]} at={[0, .012, 0]} color={color} opacity={opacity} radius={.004} />
    {[-1, 1].map(sign => <Rounded key={sign} size={[w * .9, .003, .022]} at={[0, .022, sign * d * .43]} color={detail} radius={.001} opacity={opacity} />)}
    {Array.from({ length: 14 }, (_, i) => <Rounded key={i} size={[.006, .002, d * .95]} at={[-w * .46 + w * .92 * i / 13, .022, 0]} color={detail} radius={.001} opacity={opacity} />)}
  </>;
}

export function FurnitureModel({ item, opacity = 1 }: { item: FurnitureItem; opacity?: number }) {
  return <group rotation={[0, -MathUtils.degToRad(item.rotation), 0]}>
    {item.type === 'sofa' ? <Sofa item={item} opacity={opacity} />
      : item.type === 'chair' ? <Chair item={item} opacity={opacity} />
      : item.type === 'bed' ? <Bed item={item} opacity={opacity} />
      : item.type === 'table' ? <Table item={item} opacity={opacity} />
      : item.type === 'cabinet' ? <Cabinet item={item} opacity={opacity} />
      : item.type === 'plant' ? <Plant item={item} opacity={opacity} />
      : item.type === 'rug' ? <Rug item={item} opacity={opacity} />
      : <Rounded size={[item.width, item.height, item.depth]} at={[0, item.height / 2, 0]} color={item.color} opacity={opacity} radius={.025} />}
  </group>;
}
