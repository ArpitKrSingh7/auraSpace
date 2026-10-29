'use client';

import { useAppStore } from '@/store/useAppStore';
import { Download } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { exportProjectJson } from '@/domain/validation';
import { downloadFile, exportPlanSvg } from '@/domain/export';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useAppStore((s) => s.activeProject());
  if (!project) return null;

  const handleExportJSON = () => {
    try {
      downloadFile(
        exportProjectJson(project),
        `${project.name}.auraspace.json`,
        'application/json',
      );
    } catch (error) {
      useAppStore.getState().addToast((error as Error).message, 'error');
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Take your ideas with you"
      maxWidth="max-w-sm"
    >
      <div className="space-y-3">
        <button
          className="w-full card p-4 text-left hover:shadow-medium transition-all"
          onClick={handleExportJSON}
        >
          <div className="flex items-center gap-3">
            <Download className="w-5 h-5 text-brand-500" />
            <div>
              <div className="text-sm font-semibold">Project File (.json)</div>
              <div className="text-xs text-surface-500">
                Importable room data, including any saved photos. Sharing this
                file shares its contents.
              </div>
            </div>
          </div>
        </button>
        <button
          className="w-full btn-secondary text-sm"
          onClick={() =>
            downloadFile(
              exportPlanSvg(project),
              `${project.name}-plan.svg`,
              'image/svg+xml',
            )
          }
        >
          Download dimensioned plan (.svg)
        </button>
        <button
          className="w-full btn-secondary text-sm"
          onClick={() => {
            const canvas = document.querySelector(
              '.editor-viewport canvas',
            ) as HTMLCanvasElement | null;
            if (canvas)
              canvas.toBlob((blob) => {
                if (blob)
                  downloadFile(blob, `${project.name}-view.png`, 'image/png');
              });
          }}
        >
          Download current view (.png)
        </button>
        <button className="w-full btn-ghost text-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
