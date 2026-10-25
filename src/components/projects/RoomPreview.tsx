import type { Project } from '@/domain/types';
import { getCorners } from '@/domain/geometry';

/** A lightweight preview of the project's actual scene, without starting WebGL. */
export function RoomPreview({
  project,
  className = '',
}: {
  project: Project;
  className?: string;
}) {
  const { room } = project;
  const scale = Math.min(190 / room.width, 150 / room.depth);
  const point = (x: number, z: number, y = 0) => [
    200 + (x - room.width / 2 - z + room.depth / 2) * scale * 0.85,
    155 + (x - room.width / 2 + z - room.depth / 2) * scale * 0.43 - y * scale,
  ];
  const polygon = (points: number[][]) =>
    points.map((p) => p.join(',')).join(' ');
  const floor = [
    [0, 0],
    [room.width, 0],
    [room.width, room.depth],
    [0, room.depth],
  ];
  const wallHeight = Math.min(1.2, room.height);
  return (
    <svg
      viewBox="0 0 400 260"
      className={className}
      role="img"
      aria-label={`${project.name}, an illustrated preview of the room layout`}
    >
      <ellipse
        cx="200"
        cy="208"
        rx="143"
        ry="20"
        fill="#293f3a"
        opacity=".07"
      />
      <polygon
        points={polygon(floor.map(([x, z]) => point(x, z)))}
        fill={room.floorColor}
        stroke="#c0ac90"
        strokeWidth="2"
      />
      {Array.from({ length: Math.ceil(room.depth * 3) }, (_, i) => {
        const z = i / 3;
        return (
          <line
            key={i}
            x1={point(0, z)[0]}
            y1={point(0, z)[1]}
            x2={point(room.width, z)[0]}
            y2={point(room.width, z)[1]}
            stroke="#a88b64"
            opacity=".22"
          />
        );
      })}
      <polygon
        points={polygon([
          point(0, room.depth),
          point(0, 0),
          point(0, 0, wallHeight),
          point(0, room.depth, wallHeight),
        ])}
        fill={room.wallColor}
        stroke="#d0ccc1"
      />
      <polygon
        points={polygon([
          point(0, 0),
          point(room.width, 0),
          point(room.width, 0, wallHeight),
          point(0, 0, wallHeight),
        ])}
        fill={room.wallColor}
        stroke="#d0ccc1"
      />
      {project.items
        .filter((i) => i.placed)
        .sort((a, b) =>
          a.type === 'rug' ? -1 : b.type === 'rug' ? 1 : a.x + a.z - b.x - b.z,
        )
        .map((item) => {
          const corners = getCorners(item);
          const h = Math.min(item.height, 1.1);
          return (
            <g
              key={item.id}
              stroke="#3e473d"
              strokeOpacity=".15"
              strokeLinejoin="round"
            >
              <polygon
                points={polygon(corners.map((p) => point(p.x, p.z)))}
                fill="#3e473d"
                opacity=".12"
                transform="translate(2 4)"
              />
              {[1, 2].map((n) => (
                <polygon
                  key={n}
                  points={polygon([
                    point(corners[n].x, corners[n].z),
                    point(corners[(n + 1) % 4].x, corners[(n + 1) % 4].z),
                    point(corners[(n + 1) % 4].x, corners[(n + 1) % 4].z, h),
                    point(corners[n].x, corners[n].z, h),
                  ])}
                  fill={item.color}
                  style={{ filter: 'brightness(.86)' }}
                />
              ))}
              <polygon
                points={polygon(corners.map((p) => point(p.x, p.z, h)))}
                fill={item.color}
              />
              {item.type === 'sofa' && (
                <polyline
                  points={polygon([
                    point(corners[0].x, corners[0].z, h + 0.16),
                    point(corners[1].x, corners[1].z, h + 0.16),
                  ])}
                  stroke={item.color}
                  strokeWidth="9"
                  strokeLinecap="round"
                />
              )}
              {item.type === 'bed' && (
                <polygon
                  points={polygon(
                    corners
                      .slice(0, 2)
                      .flatMap((p) => [
                        point(p.x, p.z, h + 0.12),
                        point(p.x, p.z + 0.4, h + 0.12),
                      ]),
                  )}
                  fill="#f2eee6"
                />
              )}
            </g>
          );
        })}
    </svg>
  );
}
