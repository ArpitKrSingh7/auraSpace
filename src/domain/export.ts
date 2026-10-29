import type { Project } from './types';
import { dimensionedPlan, migrateLegacyProject } from '@auraspace/scene-domain';

export function exportPlanSvg(project: Project): string {
  return dimensionedPlan(migrateLegacyProject(project));
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
