import { useEffect, useMemo } from 'react';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type Triple = [number, number, number];

export function Rounded({
  size, at = [0, 0, 0], color, radius = 0.045, opacity = 1,
  roughness = 0.87, metalness = 0,
}: {
  size: Triple;
  at?: Triple;
  color: string;
  radius?: number;
  opacity?: number;
  roughness?: number;
  metalness?: number;
}) {
  const geometry = useMemo(
    () => new RoundedBoxGeometry(...size, 3, Math.min(radius, ...size.map((v) => v / 3))),
    [size[0], size[1], size[2], radius],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh position={at} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness}
        transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

/** Flat boards keep repeated shelves, books and trim inexpensive on mobile. */
export function Board({ size, at = [0, 0, 0], color, opacity = 1,
  roughness = 0.8, metalness = 0,
}: {
  size: Triple;
  at?: Triple;
  color: string;
  opacity?: number;
  roughness?: number;
  metalness?: number;
}) {
  return (
    <mesh position={at} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness}
        transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

export function Leg({ x, z, height = 0.18, radius = 0.027,
  color = '#715541', opacity = 1,
}: {
  x: number;
  z: number;
  height?: number;
  radius?: number;
  color?: string;
  opacity?: number;
}) {
  return (
    <mesh position={[x, height / 2, z]} castShadow>
      <cylinderGeometry args={[radius * 0.82, radius, height, 8]} />
      <meshStandardMaterial color={color} roughness={0.65}
        transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

export function Feet({ width, depth, height = 0.18, inset = 0.11,
  color, opacity = 1,
}: {
  width: number;
  depth: number;
  height?: number;
  inset?: number;
  color?: string;
  opacity?: number;
}) {
  return (
    <>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
        <Leg key={`${x},${z}`} x={x * (width / 2 - inset)}
          z={z * (depth / 2 - inset)} height={height} color={color}
          radius={Math.min(0.027, width * 0.045, depth * 0.045)} opacity={opacity} />
      )))}
    </>
  );
}
