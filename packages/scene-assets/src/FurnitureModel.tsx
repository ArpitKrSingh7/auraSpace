import type { FurnitureItem } from '@auraspace/scene-domain/legacy/types';
import { getItemElevation } from '@auraspace/scene-domain/legacy/geometry';
import { Color, MathUtils } from 'three';
import { Feet, Rounded } from './FurniturePrimitives';
import {
  AirConditioner, BedsideTable, Bookshelf, CeilingFan, Desk, DressingTable,
  Fridge, Mirror, ShoeRack, TvUnit, Wardrobe,
} from './HouseholdFurniture';

function Sofa({ item, opacity }: { item: FurnitureItem; opacity: number }) {
  const { width: w, depth: d, height: h, color } = item;
  const light = `#${new Color(color).lerp(new Color('#ffffff'), 0.12).getHexString()}`;
  const seat = Math.min(0.43, h * 0.5),
    arm = Math.min(0.16, w * 0.12);
  return (
    <>
      <Feet width={w} depth={d} height={h * 0.14} />
      <Rounded
        size={[w, h * 0.2, d]}
        at={[0, h * 0.24, 0]}
        color={color}
        opacity={opacity}
      />
      <Rounded
        size={[w, h * 0.62, Math.max(0.1, d * 0.2)]}
        at={[0, h * 0.67, -d * 0.4]}
        color={color}
        opacity={opacity}
        radius={0.08}
      />
      {[-1, 1].map((side) => (
        <Rounded
          key={side}
          size={[arm, h * 0.52, d * 0.94]}
          at={[(side * (w - arm)) / 2, h * 0.48, 0.01]}
          color={color}
          opacity={opacity}
          radius={0.06}
        />
      ))}
      {Array.from({ length: w > 1.7 ? 3 : 2 }, (_, i) => {
        const count = w > 1.7 ? 3 : 2,
          cushionW = (w - arm * 2 - 0.06) / count;
        return (
          <Rounded
            key={i}
            size={[cushionW - 0.022, Math.max(0.09, h * 0.14), d * 0.69]}
            at={[
              -(w - arm * 2 - 0.06) / 2 + cushionW * (i + 0.5),
              seat,
              d * 0.08,
            ]}
            color={light}
            opacity={opacity}
            radius={0.06}
          />
        );
      })}
      <group
        position={[-w * 0.32, h * 0.65, -d * 0.22]}
        rotation={[0, 0.12, -0.16]}
      >
        <Rounded
          size={[w * 0.17, h * 0.36, 0.13]}
          color="#e8ddd0"
          opacity={opacity}
          radius={0.06}
        />
      </group>
    </>
  );
}

function Chair({ item, opacity }: { item: FurnitureItem; opacity: number }) {
  const { width: w, depth: d, height: h, color } = item;
  return (
    <>
      <Feet
        width={w}
        depth={d}
        height={h * 0.43}
        inset={Math.min(w, d) * 0.16}
      />
      <Rounded
        size={[w, h * 0.15, d * 0.94]}
        at={[0, h * 0.46, 0]}
        color={color}
        opacity={opacity}
        radius={0.065}
      />
      <group position={[0, h * 0.75, -d * 0.4]} rotation={[-0.1, 0, 0]}>
        <Rounded
          size={[w * 0.91, h * 0.48, d * 0.17]}
          color={color}
          opacity={opacity}
          radius={0.07}
        />
      </group>
      {[-1, 1].map((side) => (
        <Rounded
          key={side}
          size={[w * 0.11, h * 0.25, d * 0.76]}
          at={[side * w * 0.45, h * 0.59, -0.025]}
          color={color}
          opacity={opacity}
        />
      ))}
    </>
  );
}

function Bed({ item, opacity }: { item: FurnitureItem; opacity: number }) {
  const { width: w, depth: d, height: h, color } = item;
  return (
    <>
      <Feet width={w} depth={d} height={0.13} />
      <Rounded
        size={[w, h * 0.27, d]}
        at={[0, h * 0.24, 0]}
        color="#a58a70"
        opacity={opacity}
      />
      <Rounded
        size={[w * 0.99, h * 0.24, d * 0.98]}
        at={[0, h * 0.48, 0]}
        color="#f7f1e7"
        opacity={opacity}
        radius={0.08}
      />
      <Rounded
        size={[w * 1.01, h, 0.12]}
        at={[0, h / 2, -d * 0.47]}
        color={color}
        opacity={opacity}
        radius={0.06}
      />
      <Rounded
        size={[w, 0.055, d * 0.58]}
        at={[0, h * 0.625, d * 0.19]}
        color={color}
        opacity={opacity}
        radius={0.018}
      />
      {[-1, 1].map((side) => (
        <Rounded
          key={side}
          size={[w * 0.4, 0.1, d * 0.23]}
          at={[side * w * 0.24, h * 0.66, -d * 0.3]}
          color="#fffaf0"
          opacity={opacity}
          radius={0.07}
        />
      ))}
      <Rounded
        size={[w * 1.015, 0.065, d * 0.18]}
        at={[0, h * 0.68, d * 0.35]}
        color="#d2b49a"
        opacity={opacity}
        radius={0.01}
      />
    </>
  );
}

function Table({ item, opacity }: { item: FurnitureItem; opacity: number }) {
  const { width: w, depth: d, height: h, color } = item;
  return (
    <>
      <Feet
        width={w}
        depth={d}
        height={Math.max(0.07, h - 0.07)}
        inset={Math.min(w, d) * 0.2}
        color={color}
      />
      <Rounded
        size={[w, Math.min(0.08, h * 0.2), d]}
        at={[0, h - Math.min(0.04, h * 0.1), 0]}
        color={color}
        opacity={opacity}
        radius={0.055}
      />
      <mesh
        position={[w * 0.21, h + 0.006, -d * 0.12]}
        rotation={[-Math.PI / 2, 0, 0.15]}
      >
        <planeGeometry args={[w * 0.23, d * 0.32]} />
        <meshStandardMaterial
          color="#e6d9c6"
          roughness={1}
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[-w * 0.15, h + 0.055, -0.025]} castShadow>
        <cylinderGeometry args={[0.055, 0.04, 0.1, 16]} />
        <meshStandardMaterial color="#d3b59b" roughness={0.8} />
      </mesh>
    </>
  );
}

function Cabinet({ item, opacity }: { item: FurnitureItem; opacity: number }) {
  const { width: w, depth: d, height: h, color } = item;
  return (
    <>
      <Feet width={w} depth={d} height={h * 0.12} />
      <Rounded
        size={[w, h * 0.88, d]}
        at={[0, h * 0.56, 0]}
        color={color}
        opacity={opacity}
        radius={0.025}
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Rounded
            size={[w * 0.48, h * 0.79, 0.018]}
            at={[side * w * 0.25, h * 0.56, d / 2 + 0.005]}
            color={color}
            opacity={opacity}
            radius={0.004}
          />
          <Rounded
            size={[0.016, h * 0.13, 0.025]}
            at={[side * w * 0.07, h * 0.58, d / 2 + 0.023]}
            color="#d7c298"
            opacity={opacity}
            radius={0.003}
          />
        </group>
      ))}
    </>
  );
}

function Plant({ item, opacity }: { item: FurnitureItem; opacity: number }) {
  const { width: w, depth: d, height: h, color } = item;
  const radius = Math.min(w, d) * 0.29;
  return (
    <>
      <mesh position={[0, h * 0.16, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius * 0.75, h * 0.32, 24]} />
        <meshStandardMaterial
          color="#c79877"
          roughness={0.88}
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, h * 0.323, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.92, 24]} />
        <meshStandardMaterial color="#5c4937" />
      </mesh>
      <mesh position={[0, h * 0.54, 0]}>
        <cylinderGeometry args={[0.012, 0.019, h * 0.51, 8]} />
        <meshStandardMaterial color="#685b3c" />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => {
        const angle = i * 2.399,
          reach = 0.22 + (i % 3) * 0.075;
        return (
          <mesh
            key={i}
            position={[
              Math.sin(angle) * w * reach,
              h * (0.52 + (i % 4) * 0.105),
              Math.cos(angle) * d * reach,
            ]}
            rotation={[0.35, angle, 0.4]}
            scale={[w * 0.23, h * 0.18, d * 0.11]}
            castShadow
          >
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial
              color={new Color(color).offsetHSL(0, -0.03, (i % 3) * 0.035)}
              roughness={0.9}
              transparent={opacity < 1}
              opacity={opacity}
            />
          </mesh>
        );
      })}
    </>
  );
}

function Rug({ item, opacity }: { item: FurnitureItem; opacity: number }) {
  const { width: w, depth: d, color } = item;
  const detail = `#${new Color(color).lerp(new Color('#f7f3e9'), 0.23).getHexString()}`;
  return (
    <>
      <Rounded
        size={[w, 0.016, d]}
        at={[0, 0.012, 0]}
        color={color}
        opacity={opacity}
        radius={0.004}
      />
      {[-1, 1].map((sign) => (
        <Rounded
          key={sign}
          size={[w * 0.9, 0.003, 0.022]}
          at={[0, 0.022, sign * d * 0.43]}
          color={detail}
          radius={0.001}
          opacity={opacity}
        />
      ))}
      {Array.from({ length: 14 }, (_, i) => (
        <Rounded
          key={i}
          size={[0.006, 0.002, d * 0.95]}
          at={[-w * 0.46 + (w * 0.92 * i) / 13, 0.022, 0]}
          color={detail}
          radius={0.001}
          opacity={opacity}
        />
      ))}
    </>
  );
}

export function FurnitureModel({
  item,
  opacity = 1,
  roomHeight,
}: {
  item: FurnitureItem;
  opacity?: number;
  roomHeight?: number;
}) {
  return (
    <group position={[0, getItemElevation(item, roomHeight), 0]}
      rotation={[0, -MathUtils.degToRad(item.rotation), 0]}>
      {item.type === 'sofa' ? (
        <Sofa item={item} opacity={opacity} />
      ) : item.type === 'chair' ? (
        <Chair item={item} opacity={opacity} />
      ) : item.type === 'bed' ? (
        <Bed item={item} opacity={opacity} />
      ) : item.type === 'table' ? (
        <Table item={item} opacity={opacity} />
      ) : item.type === 'cabinet' ? (
        <Cabinet item={item} opacity={opacity} />
      ) : item.type === 'plant' ? (
        <Plant item={item} opacity={opacity} />
      ) : item.type === 'rug' ? (
        <Rug item={item} opacity={opacity} />
      ) : item.type === 'wardrobe' ? (
        <Wardrobe item={item} opacity={opacity} />
      ) : item.type === 'dressing-table' ? (
        <DressingTable item={item} opacity={opacity} />
      ) : item.type === 'mirror' ? (
        <Mirror item={item} opacity={opacity} />
      ) : item.type === 'air-conditioner' ? (
        <AirConditioner item={item} opacity={opacity} />
      ) : item.type === 'ceiling-fan' ? (
        <CeilingFan item={item} opacity={opacity} />
      ) : item.type === 'desk' ? (
        <Desk item={item} opacity={opacity} />
      ) : item.type === 'bedside-table' ? (
        <BedsideTable item={item} opacity={opacity} />
      ) : item.type === 'bookshelf' ? (
        <Bookshelf item={item} opacity={opacity} />
      ) : item.type === 'shoe-rack' ? (
        <ShoeRack item={item} opacity={opacity} />
      ) : item.type === 'tv-unit' ? (
        <TvUnit item={item} opacity={opacity} />
      ) : item.type === 'fridge' ? (
        <Fridge item={item} opacity={opacity} />
      ) : (
        <Rounded
          size={[item.width, item.height, item.depth]}
          at={[0, item.height / 2, 0]}
          color={item.color}
          opacity={opacity}
          radius={0.025}
        />
      )}
    </group>
  );
}
