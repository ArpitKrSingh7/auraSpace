'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/src/store/useAppStore';
import { ViewModeSwitch } from './ViewModeSwitch';
import { Tooltip } from '../ui/Tooltip';

export function Toolbar() {
  const router = useRouter();
  const viewMode = useAppStore(s => s.viewMode);
  const setViewMode = useAppStore(s => s.setViewMode);
  const project = useAppStore(s => s.getActiveProject());
  const updateProjectName = useAppStore(s => s.updateProjectName);
  const undo = useAppStore(s => s.undo);
  const redo = useAppStore(s => s.redo);
  const history = useAppStore(s => s.history);
  const historyIndex = useAppStore(s => s.historyIndex);
  const openDialog = useAppStore(s => s.openDialog);
  const saveToStorage = useAppStore(s => s.saveToStorage);
  const addToast = useAppStore(s => s.addToast);

  if (!project) return null;

  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className="toolbar-gradient safe-top z-30">
      <div className="flex items-center h-12 px-2 gap-1">
        {/* Back */}
        <button
          onClick={() => { saveToStorage(); router.push('/'); }}
          className="touch-target flex items-center justify-center text-white/90 hover:text-white"
          aria-label="Back to projects"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        {/* Project Name */}
        <input
          type="text"
          value={project.name}
          onChange={e => updateProjectName(e.target.value)}
          className="flex-1 min-w-0 text-sm font-medium text-white bg-transparent border-none outline-none truncate px-2"
          placeholder="Room name"
        />

        {/* View Mode */}
        <ViewModeSwitch value={viewMode} onChange={setViewMode} />

        {/* Undo */}
        <Tooltip content="Undo">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="touch-target flex items-center justify-center text-white/70 hover:text-white disabled:text-white/20"
            aria-label="Undo"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" /><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
            </svg>
          </button>
        </Tooltip>

        {/* Redo */}
        <Tooltip content="Redo">
          <button
            onClick={redo}
            disabled={!canRedo}
            className="touch-target flex items-center justify-center text-white/70 hover:text-white disabled:text-white/20"
            aria-label="Redo"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3L21 13" />
            </svg>
          </button>
        </Tooltip>

        {/* More */}
        <button
          onClick={() => openDialog('export')}
          className="touch-target flex items-center justify-center text-white/70 hover:text-white"
          aria-label="More options"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
