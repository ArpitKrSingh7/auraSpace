import type { FurnitureItem } from '@auraspace/scene-domain/legacy/types';
import { Color } from 'three';
import { Board, Feet, Rounded, type Triple } from './FurniturePrimitives';

type ModelProps = { item: FurnitureItem; opacity: number };
const metal = '#b6bec5';
const dark = '#252b31';
function tint(color: string, amount = 0.12) {
  return `#${new Color(color).lerp(new Color('#fff8eb'), amount).getHexString()}`;
}

function Pull({ at, width, height, depth, opacity }: {
  at: Triple; width: number; height: number; depth: number; opacity: number;
}) {
  return <Rounded size={[width, height, depth]} at={at} color={metal}
    radius={Math.min(width, height) * 0.3} roughness={0.35} metalness={0.65} opacity={opacity} />;
}

export function Wardrobe({ item, opacity }: ModelProps) {
  const { width: w, depth: d, height: h, color } = item;
  return <>
    <Board size={[w * 0.94, h * 0.06, d * 0.87]} at={[0, h * 0.03, 0]} color={dark} opacity={opacity} />
    <Rounded size={[w, h * 0.94, d * 0.9]} at={[0, h * 0.53, -d * 0.05]} color={color} opacity={opacity} radius={0.018} />
    {[-1, 1].map((side) => <group key={side}>
      <Rounded size={[w * 0.479, h * 0.885, d * 0.045]}
        at={[side * w * 0.246, h * 0.515, d * 0.432]} color={tint(color, 0.07)} opacity={opacity} radius={0.009} />
      <Board size={[w * 0.39, h * 0.008, d * 0.008]}
        at={[side * w * 0.246, h * 0.17, d * 0.459]} color={tint(color, 0.24)} opacity={opacity} />
      <Pull at={[side * w * 0.055, h * 0.53, d * 0.475]}
        width={w * 0.018} height={h * 0.125} depth={d * 0.04} opacity={opacity} />
    </group>)}
    <Board size={[w * 0.99, h * 0.028, d * 0.96]} at={[0, h * 0.98, -d * 0.02]} color={tint(color)} opacity={opacity} />
  </>;
}

/** A pale silver pane suggests glass without a costly scene reflection pass. */
function MirrorFrame({ width: w, height: h, depth: d, color, opacity }: {
  width: number; height: number; depth: number; color: string; opacity: number;
}) {
  return <>
    <Rounded size={[w, h, d * 0.72]} at={[0, h / 2, -d * 0.14]} color={color} opacity={opacity} radius={0.025} />
    <Board size={[w * 0.86, h * 0.9, d * 0.08]} at={[0, h / 2, d * 0.26]}
      color="#bcd0da" roughness={0.3} metalness={0.55} opacity={opacity} />
    <Board size={[w * 0.035, h * 0.82, d * 0.012]} at={[-w * 0.385, h * 0.51, d * 0.307]}
      color="#eef5f6" roughness={0.25} opacity={opacity} />
    <Board size={[w * 0.72, h * 0.012, d * 0.012]} at={[w * 0.025, h * 0.92, d * 0.307]}
      color="#dfe9ec" opacity={opacity} />
  </>;
}

export function Mirror({ item, opacity }: ModelProps) {
  return <MirrorFrame width={item.width} height={item.height} depth={item.depth}
    color={item.color} opacity={opacity} />;
}

export function DressingTable({ item, opacity }: ModelProps) {
  const { width: w, depth: d, height: h, color } = item;
  return <>
    <Feet width={w * 0.94} depth={d * 0.9} height={h * 0.075} inset={Math.min(w, d) * 0.12} color={color} opacity={opacity} />
    <Rounded size={[w * 0.96, h * 0.36, d * 0.92]} at={[0, h * 0.26, -d * 0.02]} color={color} opacity={opacity} radius={0.018} />
    <Rounded size={[w, h * 0.035, d]} at={[0, h * 0.4575, 0]} color={tint(color)} opacity={opacity} radius={0.012} />
    {[-1, 1].flatMap((side) => [0, 1].map((row) => <group key={`${side}-${row}`}>
      <Board size={[w * 0.45, h * 0.157, d * 0.025]}
        at={[side * w * 0.24, h * (0.175 + row * 0.175), d * 0.455]} color={tint(color, 0.07)} opacity={opacity} />
      <Pull at={[side * w * 0.24, h * (0.19 + row * 0.175), d * 0.48]}
        width={w * 0.13} height={h * 0.009} depth={d * 0.03} opacity={opacity} />
    </group>))}
    <group position={[0, h * 0.49, -d * 0.4]}>
      <MirrorFrame width={w * 0.79} height={h * 0.51} depth={d * 0.14} color={color} opacity={opacity} />
    </group>
  </>;
}

export function AirConditioner({ item, opacity }: ModelProps) {
  const { width: w, depth: d, height: h, color } = item;
  return <>
    <Rounded size={[w, h, d * 0.91]} at={[0, h / 2, -d * 0.045]} color={color}
      radius={Math.min(h * 0.16, d * 0.22)} roughness={0.45} opacity={opacity} />
    <Rounded size={[w * 0.9, h * 0.2, d * 0.035]} at={[0, h * 0.19, d * 0.42]}
      color="#36414a" radius={0.008} opacity={opacity} />
    {[0, 1, 2].map((i) => <Board key={i} size={[w * 0.87, h * 0.018, d * 0.045]}
      at={[0, h * (0.13 + i * 0.056), d * 0.451]} color="#abb5ba" opacity={opacity} />)}
    <Board size={[w * 0.84, h * 0.009, d * 0.013]} at={[0, h * 0.78, d * 0.416]} color={tint('#aeb8bd', 0.35)} opacity={opacity} />
    <Board size={[w * 0.08, h * 0.08, d * 0.017]} at={[w * 0.35, h * 0.4, d * 0.419]} color="#d7e4e9" opacity={opacity} />
    <mesh position={[w * 0.39, h * 0.39, d * 0.435]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[Math.min(w, h) * 0.023, Math.min(w, h) * 0.023, d * 0.015, 8]} />
      <meshStandardMaterial color="#7ec6aa" emissive="#4f9b7b" emissiveIntensity={0.3} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  </>;
}

export function CeilingFan({ item, opacity }: ModelProps) {
  return <group scale={[item.width, item.height, item.depth]}>
    <mesh position={[0, 0.94, 0]} castShadow>
      <cylinderGeometry args={[0.055, 0.085, 0.12, 16]} />
      <meshStandardMaterial color={item.color} roughness={0.5} transparent={opacity < 1} opacity={opacity} />
    </mesh>
    <mesh position={[0, 0.59, 0]} castShadow>
      <cylinderGeometry args={[0.014, 0.014, 0.62, 8]} />
      <meshStandardMaterial color={item.color} roughness={0.5} transparent={opacity < 1} opacity={opacity} />
    </mesh>
    <mesh position={[0, 0.19, 0]} castShadow>
      <cylinderGeometry args={[0.086, 0.07, 0.2, 20]} />
      <meshStandardMaterial color={item.color} roughness={0.5} transparent={opacity < 1} opacity={opacity} />
    </mesh>
    {[0, 1, 2].map((i) => <group key={i} rotation={[0, i * Math.PI * 2 / 3, 0]}>
      <Board size={[0.17, 0.027, 0.038]} at={[0.1, 0.2, 0]} color={metal} opacity={opacity} />
      <group position={[0.295, 0.2, 0]} rotation={[0, -0.12, 0.035]}>
        <Rounded size={[0.36, 0.035, 0.125]} color={tint(item.color, 0.07)} radius={0.03} opacity={opacity} roughness={0.5} />
        <Board size={[0.23, 0.008, 0.007]} at={[0.025, 0.02, 0]} color={tint(item.color, 0.24)} opacity={opacity} />
      </group>
    </group>)}
    <mesh position={[0, 0.065, 0]} castShadow>
      <cylinderGeometry args={[0.047, 0.038, 0.05, 16]} />
      <meshStandardMaterial color={item.color} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  </group>;
}

export function Desk({ item, opacity }: ModelProps) {
  const { width: w, depth: d, height: h, color } = item;
  return <>
    <Feet width={w} depth={d} height={h * 0.94} inset={Math.min(w, d) * 0.14} color={dark} opacity={opacity} />
    <Rounded size={[w, h * 0.065, d]} at={[0, h * 0.9675, 0]} color={color} opacity={opacity} radius={0.016} />
    <Board size={[w * 0.82, h * 0.17, d * 0.035]} at={[0, h * 0.82, -d * 0.39]} color={color} opacity={opacity} />
    <Rounded size={[w * 0.32, h * 0.19, d * 0.75]} at={[w * 0.265, h * 0.835, d * 0.015]} color={color} opacity={opacity} radius={0.009} />
    <Board size={[w * 0.3, h * 0.155, d * 0.025]} at={[w * 0.265, h * 0.835, d * 0.403]} color={tint(color)} opacity={opacity} />
    <Pull at={[w * 0.265, h * 0.845, d * 0.43]} width={w * 0.105} height={h * 0.016} depth={d * 0.035} opacity={opacity} />
  </>;
}

export function BedsideTable({ item, opacity }: ModelProps) {
  const { width: w, depth: d, height: h, color } = item;
  return <>
    <Feet width={w} depth={d} height={h * 0.15} inset={Math.min(w, d) * 0.15} color={color} opacity={opacity} />
    <Rounded size={[w * 0.97, h * 0.82, d * 0.93]} at={[0, h * 0.56, -d * 0.035]} color={color} opacity={opacity} radius={0.015} />
    <Rounded size={[w, h * 0.045, d]} at={[0, h * 0.9775, 0]} color={tint(color)} opacity={opacity} radius={0.012} />
    {[0, 1].map((row) => <group key={row}>
      <Board size={[w * 0.87, h * 0.35, d * 0.025]} at={[0, h * (0.36 + row * 0.39), d * 0.447]} color={tint(color, 0.07)} opacity={opacity} />
      <Pull at={[0, h * (0.4 + row * 0.39), d * 0.475]} width={w * 0.25} height={h * 0.025} depth={d * 0.04} opacity={opacity} />
    </group>)}
  </>;
}

const bookColors = ['#8a4c39', '#d9be85', '#607b76', '#506578', '#aa7650', '#b7aaa0'];
export function Bookshelf({ item, opacity }: ModelProps) {
  const { width: w, depth: d, height: h, color } = item;
  return <>
    <Board size={[w, h, d * 0.07]} at={[0, h / 2, -d * 0.465]} color={tint(color, 0.05)} opacity={opacity} />
    {[-1, 1].map((side) => <Board key={side} size={[w * 0.055, h, d]}
      at={[side * w * 0.4725, h / 2, 0]} color={color} opacity={opacity} />)}
    {[0, 1, 2, 3, 4].map((shelf) => <Board key={shelf} size={[w * 0.9, h * 0.026, d]}
      at={[0, h * (0.035 + shelf * 0.238), 0]} color={color} opacity={opacity} />)}
    {[0, 1, 2, 3].flatMap((row) => Array.from({ length: row === 2 ? 3 : 5 }, (_, i) => {
      const bookH = h * (0.13 + ((i + row) % 3) * 0.025);
      const x = w * (-0.34 + i * 0.12 + (row % 2) * 0.07);
      return <group key={`${row}-${i}`}>
        <Board size={[w * 0.092, bookH, d * 0.57]}
          at={[x, h * (0.049 + row * 0.238) + bookH / 2, -d * 0.04]}
          color={bookColors[(i + row * 2) % bookColors.length]!} opacity={opacity} />
        <Board size={[w * 0.066, h * 0.005, d * 0.008]}
          at={[x, h * (0.049 + row * 0.238) + bookH * 0.8, d * 0.25]}
          color="#e5d9bc" opacity={opacity} />
      </group>;
    }))}
    <Board size={[w * 0.25, h * 0.07, d * 0.65]} at={[w * 0.245, h * 0.562, 0]} color="#bfa287" opacity={opacity} />
    <Board size={[w * 0.23, h * 0.012, d * 0.67]} at={[w * 0.245, h * 0.603, 0]} color="#dbbf94" opacity={opacity} />
  </>;
}

function Shoe({ at, width: w, height: h, depth: d, color, opacity }: {
  at: Triple; width: number; height: number; depth: number; color: string; opacity: number;
}) {
  return <group position={at}>
    <Rounded size={[w, h * 0.22, d]} at={[0, h * 0.11, 0]} color="#d6d0c3" opacity={opacity} radius={0.012} />
    <Rounded size={[w * 0.94, h * 0.53, d * 0.94]} at={[0, h * 0.42, 0]} color={color} opacity={opacity} radius={0.025} />
    <Rounded size={[w * 0.75, h * 0.45, d * 0.38]} at={[0, h * 0.7, -d * 0.21]} color={color} opacity={opacity} radius={0.012} />
  </group>;
}

export function ShoeRack({ item, opacity }: ModelProps) {
  const { width: w, depth: d, height: h, color } = item;
  return <>
    {[-1, 1].map((side) => <Board key={side} size={[w * 0.05, h, d]}
      at={[side * w * 0.475, h / 2, 0]} color={color} opacity={opacity} />)}
    {[0, 1, 2].map((row) => <Board key={row} size={[w * 0.91, h * 0.055, d * 0.94]}
      at={[0, h * (0.095 + row * 0.38), 0]} color={color} opacity={opacity} />)}
    {[0, 1].flatMap((row) => [-1, 1].flatMap((pair) => [-1, 1].map((foot) => <Shoe
      key={`${row}-${pair}-${foot}`} at={[pair * w * 0.225 + foot * w * 0.068, h * (0.123 + row * 0.38), d * 0.015]}
      width={w * 0.105} height={h * 0.22} depth={d * 0.76}
      color={row === 0 ? '#65574b' : '#34414c'} opacity={opacity} />)))}
    <Board size={[w * 0.91, h * 0.07, d * 0.04]} at={[0, h * 0.82, -d * 0.42]} color={color} opacity={opacity} />
  </>;
}

export function TvUnit({ item, opacity }: ModelProps) {
  const { width: w, depth: d, height: h, color } = item;
  return <>
    <Feet width={w * 0.96} depth={d * 0.9} height={h * 0.07} inset={Math.min(w, d) * 0.14} color={dark} opacity={opacity} />
    <Rounded size={[w, h * 0.27, d * 0.94]} at={[0, h * 0.205, -d * 0.03]} color={color} opacity={opacity} radius={0.016} />
    {[-1, 1].map((side) => <group key={side}>
      <Board size={[w * 0.295, h * 0.215, d * 0.025]} at={[side * w * 0.34, h * 0.205, d * 0.455]} color={tint(color, 0.07)} opacity={opacity} />
      <Pull at={[side * w * 0.34, h * 0.25, d * 0.48]} width={w * 0.095} height={h * 0.012} depth={d * 0.035} opacity={opacity} />
    </group>)}
    <Board size={[w * 0.31, h * 0.17, d * 0.025]} at={[0, h * 0.2, d * 0.453]} color="#3b3330" opacity={opacity} />
    <Board size={[w * 0.25, h * 0.023, d * 0.032]} at={[0, h * 0.17, d * 0.477]} color="#161d24" opacity={opacity} />
    {[-1, 1].map((side) => <group key={`stand-${side}`} position={[side * w * 0.245, h * 0.375, 0]} rotation={[0, 0, side * 0.18]}>
      <Board size={[w * 0.025, h * 0.11, d * 0.45]} color={dark} opacity={opacity} />
    </group>)}
    <Rounded size={[w * 0.88, h * 0.57, d * 0.12]} at={[0, h * 0.715, -d * 0.04]} color="#1d252c" opacity={opacity} radius={0.014} roughness={0.45} />
    <Board size={[w * 0.843, h * 0.531, d * 0.009]} at={[0, h * 0.72, d * 0.025]}
      color="#334853" roughness={0.38} metalness={0.15} opacity={opacity} />
    <Board size={[w * 0.3, h * 0.004, d * 0.011]} at={[-w * 0.2, h * 0.953, d * 0.031]} color="#69808c" opacity={opacity} />
    <Board size={[w * 0.011, h * 0.004, d * 0.012]} at={[0, h * 0.439, d * 0.025]} color="#a5b8bc" opacity={opacity} />
  </>;
}

export function Fridge({ item, opacity }: ModelProps) {
  const { width: w, depth: d, height: h, color } = item;
  return <>
    <Feet width={w} depth={d} height={h * 0.035} inset={Math.min(w, d) * 0.15} color={dark} opacity={opacity} />
    <Rounded size={[w, h * 0.965, d * 0.91]} at={[0, h * 0.5175, -d * 0.045]}
      color={tint(color, 0.02)} roughness={0.45} opacity={opacity} radius={0.028} />
    <Rounded size={[w * 0.965, h * 0.29, d * 0.095]} at={[0, h * 0.835, d * 0.4475]}
      color={color} roughness={0.38} opacity={opacity} radius={0.016} />
    <Rounded size={[w * 0.965, h * 0.625, d * 0.095]} at={[0, h * 0.36, d * 0.4475]}
      color={color} roughness={0.38} opacity={opacity} radius={0.016} />
    <Pull at={[-w * 0.36, h * 0.76, d * 0.482]} width={w * 0.035} height={h * 0.13} depth={d * 0.035} opacity={opacity} />
    <Pull at={[-w * 0.36, h * 0.58, d * 0.482]} width={w * 0.035} height={h * 0.15} depth={d * 0.035} opacity={opacity} />
    <Board size={[w * 0.19, h * 0.012, d * 0.009]} at={[w * 0.2, h * 0.922, d * 0.493]} color={metal} opacity={opacity} />
    <Board size={[w * 0.81, h * 0.025, d * 0.015]} at={[0, h * 0.036, d * 0.36]} color={dark} opacity={opacity} />
  </>;
}
