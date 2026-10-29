import {
  applyRoomReconstruction,
  migrateLegacyProject,
  roomReconstructionImageIssues,
  roomReconstructionProposalSchema,
  toLegacyProject,
  type ApplyRoomReconstructionOptions,
  type RoomReconstructionProposal,
} from '../../packages/scene-domain/src/index';
import type { Project } from '../domain/types';
import { validateRoom } from '../domain/validation';

/** Keep every pixel coordinate in the oriented source image, including H and K. */
export function mapRoomProposalToSource(
  raw: unknown,
  analysis: { width: number; height: number },
  source: { width: number; height: number },
): RoomReconstructionProposal {
  if (![analysis.width, analysis.height, source.width, source.height].every((v) => Number.isFinite(v) && v > 0))
    throw new Error('The photograph has invalid dimensions. Import it again.');
  const proposal = roomReconstructionProposalSchema.parse(raw);
  const issues = roomReconstructionImageIssues(proposal, analysis.width, analysis.height);
  if (issues.length) throw new Error(issues[0]);
  const sx = source.width / analysis.width, sy = source.height / analysis.height;
  const scaled: RoomReconstructionProposal = {
    ...proposal,
    floorCornersPx: proposal.floorCornersPx.map(([x, y]) => [x * sx, y * sy]),
    ...(proposal.imageToFloor ? {
      imageToFloor: proposal.imageToFloor.map((v, i) => i % 3 === 0 ? v / sx : i % 3 === 1 ? v / sy : v),
    } : {}),
    ...(proposal.camera ? {
      camera: { ...proposal.camera, fx: proposal.camera.fx * sx, fy: proposal.camera.fy * sy,
        cx: proposal.camera.cx * sx, cy: proposal.camera.cy * sy },
    } : {}),
    ...(proposal.openings ? {
      openings: proposal.openings.map((o) => ({ ...o,
        boxPx: [o.boxPx[0] * sx, o.boxPx[1] * sy, o.boxPx[2] * sx, o.boxPx[3] * sy],
      })),
    } : {}),
  };
  return roomReconstructionProposalSchema.parse(scaled);
}

/** Photos can finish processing during review; only geometry edits invalidate it. */
export function roomReviewSignature(project: Project): string {
  return JSON.stringify({ room: project.room, items: project.items });
}

/** Adapt the shared room operation without replacing the web project's photos or items. */
export function reviewedRoomForWeb(project: Project, photoId: string, options: ApplyRoomReconstructionOptions = {}) {
  const document = migrateLegacyProject(project);
  const result = applyRoomReconstruction(document, photoId, options);
  if (!result.ok) throw new Error(result.message);
  const room = validateRoom(toLegacyProject(result.value).room);
  return { room, warnings: result.warnings ?? [] };
}
