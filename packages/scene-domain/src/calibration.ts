import type { Outcome, PointXZ } from './index';
/** Four floor correspondences, not furniture top surfaces. Dimensions remain sourced independently. */
export function floorHomography(
  corners: PointXZ[],
  width: number,
  depth: number,
): Outcome<number[]> {
  if (
    corners.length !== 4 ||
    !corners.flat().every(Number.isFinite) ||
    ![width, depth].every((v) => Number.isFinite(v) && v > 0)
  )
    return {
      ok: false,
      message: 'Choose four floor corners and positive room dimensions.',
    };
  const turns = corners.map((a, i) => {
    const b = corners[(i + 1) % 4],
      c = corners[(i + 2) % 4];
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  });
  if (
    turns.some((v) => Math.abs(v) < 1e-8) ||
    !turns.every((v) => Math.sign(v) === Math.sign(turns[0]))
  )
    return {
      ok: false,
      message:
        'Select the four floor corners in order around the room, without crossing edges.',
    };
  const target: PointXZ[] = [
      [0, 0],
      [width, 0],
      [width, depth],
      [0, depth],
    ],
    matrix: number[][] = [];
  corners.forEach(([x, y], i) => {
    const [u, v] = target[i];
    matrix.push(
      [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
      [0, 0, 0, x, y, 1, -v * x, -v * y, v],
    );
  });
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++)
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col]))
        pivot = row;
    if (Math.abs(matrix[pivot][col]) < 1e-10)
      return {
        ok: false,
        message:
          'These corners do not define a usable floor plane. Move the handles farther apart.',
      };
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const divisor = matrix[col][col];
    for (let c = col; c < 9; c++) matrix[col][c] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const f = matrix[row][col];
      for (let c = col; c < 9; c++) matrix[row][c] -= f * matrix[col][c];
    }
  }
  return { ok: true, value: [...matrix.map((row) => row[8]), 1] };
}
export function mapFloorPoint(
  matrix: number[],
  point: PointXZ,
): PointXZ | null {
  const [x, y] = point,
    d = matrix[6] * x + matrix[7] * y + matrix[8];
  if (!Number.isFinite(d) || Math.abs(d) < 1e-9) return null;
  const mapped: PointXZ = [
    (matrix[0] * x + matrix[1] * y + matrix[2]) / d,
    (matrix[3] * x + matrix[4] * y + matrix[5]) / d,
  ];
  return mapped.every(Number.isFinite) ? mapped : null;
}
