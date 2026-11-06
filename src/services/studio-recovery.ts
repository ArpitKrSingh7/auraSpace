import { DEFAULT_SETTINGS } from '../domain/catalog';
import type { Project, Settings } from '../domain/types';
import { validateProject, validateSettings } from '../domain/validation';

/** One damaged room or setting must not hide every other saved room. */
export function recoverStudio(input: unknown): { projects?: Project[]; settings?: Settings; skipped: number } {
  if (!input || typeof input !== 'object') throw new Error('Invalid studio data.');
  const raw = input as Record<string, unknown>;
  let skipped = 0;
  const projects = Array.isArray(raw.projects) ? raw.projects.flatMap((value): Project[] => {
    try {
      const p = validateProject(value);
      return [{ ...p, photos: p.photos.map((ph) => ph.analysisStatus === 'running' ? { ...ph,
        analysisStatus: 'failed' as const, analysisMessage: 'Analysis was interrupted. Use Scan again to retry.',
      } : ph) }];
    } catch { skipped++; return []; }
  }) : undefined;
  let settings: Settings | undefined;
  try {
    if (raw.settings) {
      const value = raw.settings as Partial<Settings>;
      settings = validateSettings({ ...DEFAULT_SETTINGS, ...value,
        displayName: typeof value.displayName === 'string' && value.displayName.trim() ? value.displayName : DEFAULT_SETTINGS.displayName });
    }
  } catch { skipped++; }
  return { projects, settings, skipped };
}
