'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import type { Project } from '@/domain/types';
import {
  Plus,
  Sofa,
  BedDouble,
  Star,
  StarOff,
  Trash2,
  Copy,
  Settings,
  ChevronRight,
  Sparkles,
  Camera,
  Box,
  ArrowRight,
} from 'lucide-react';

/* ── New Room Dialog ── */
function NewRoomDialog({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (name: string, w: number, d: number, h: number) => void;
}) {
  const [name, setName] = useState('My room');
  const [width, setWidth] = useState(5);
  const [depth, setDepth] = useState(4);
  const [height, setHeight] = useState(2.8);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-heavy w-full max-w-md p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-1">Create a new room</h2>
        <p className="text-sm text-surface-500 mb-6">Set the dimensions. You can adjust them later.</p>

        <div className="space-y-4">
          <div>
            <label className="label mb-1 block">Room Name</label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label mb-1 block">Width (m)</label>
              <input
                className="input-field"
                type="number"
                step={0.1}
                min={1}
                max={20}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label mb-1 block">Depth (m)</label>
              <input
                className="input-field"
                type="number"
                step={0.1}
                min={1}
                max={20}
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label mb-1 block">Height (m)</label>
              <input
                className="input-field"
                type="number"
                step={0.1}
                min={2}
                max={5}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="bg-surface-50 rounded-xl p-4 text-center">
            <div className="text-3xl font-light text-brand-500">
              {(width * depth).toFixed(1)} m²
            </div>
            <div className="text-xs text-surface-500 mt-1">Floor area</div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary flex-1"
            onClick={() => onCreate(name, width, depth, height)}
          >
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Project Card ── */
function ProjectCard({
  project,
  onOpen,
  onFavorite,
  onDuplicate,
  onDelete,
}: {
  project: Project;
  onOpen: () => void;
  onFavorite: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const coverColors: Record<string, string> = {
    living: 'from-emerald-100 to-amber-50',
    bedroom: 'from-violet-100 to-rose-50',
    workspace: 'from-blue-100 to-cyan-50',
  };
  const cover = project.cover ? coverColors[project.cover] : 'from-surface-100 to-surface-200';
  const placed = project.items.filter((i) => i.placed).length;
  const unplaced = project.items.filter((i) => !i.placed).length;

  return (
    <div
      className="card group cursor-pointer hover:shadow-medium transition-all duration-200 overflow-hidden"
      onClick={onOpen}
    >
      {/* Cover */}
      <div className={`h-28 bg-gradient-to-br ${cover} relative flex items-center justify-center`}>
        <div className="text-4xl opacity-30">
          {project.cover === 'bedroom' ? '🛏️' : project.cover === 'workspace' ? '💼' : '🛋️'}
        </div>
        {project.sample && (
          <span className="absolute top-2 left-2 badge-success text-[10px]">Sample</span>
        )}
        <button
          className="absolute top-2 right-2 p-1.5 rounded-full bg-white/70 hover:bg-white transition-colors"
          onClick={(e) => { e.stopPropagation(); onFavorite(); }}
        >
          {project.favorite ? (
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
          ) : (
            <StarOff className="w-4 h-4 text-surface-400" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-sm truncate">{project.name}</h3>
        <p className="text-xs text-surface-500 mt-1">
          {project.room.width}×{project.room.depth}m · {placed} placed
          {unplaced > 0 && ` · ${unplaced} in tray`}
        </p>
        <div className="flex items-center justify-between mt-3">
          <span className="text-[10px] text-surface-400">
            {new Date(project.updatedAt).toLocaleDateString()}
          </span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="p-1.5 rounded-lg hover:bg-surface-100"
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              title="Duplicate"
            >
              <Copy className="w-3.5 h-3.5 text-surface-500" />
            </button>
            {!project.sample && (
              <button
                className="p-1.5 rounded-lg hover:bg-red-50"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Home Page ── */
export default function HomePage() {
  const router = useRouter();
  const {
    projects,
    createProject,
    openProject,
    deleteProject,
    duplicateProject,
    toggleFavorite,
    initSamples,
    settings,
    updateSettings,
  } = useAppStore();
  const [showDialog, setShowDialog] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    initSamples();
  }, [initSamples]);

  const handleCreate = (name: string, w: number, d: number, h: number) => {
    const id = createProject(name, w, d, h);
    setShowDialog(false);
    router.push(`/editor/${id}`);
  };

  const handleOpen = (id: string) => {
    openProject(id);
    router.push(`/editor/${id}`);
  };

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-brand-500 text-lg">Loading studio…</div>
      </div>
    );
  }

  const favorites = projects.filter((p) => p.favorite);
  const recent = projects.filter((p) => !p.favorite).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <main className="min-h-screen pb-20">
      {/* Header */}
      <header className="bg-brand-500 text-white">
        <div className="max-w-5xl mx-auto px-4 pt-10 pb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Box className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">AuraSpace</h1>
                <p className="text-xs text-white/70">Intelligent 2D/3D Room Studio</p>
              </div>
            </div>
            <button
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
              onClick={() => updateSettings({ onboardingSeen: true })}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>

          <h2 className="text-2xl font-light mb-2">Design your space</h2>
          <p className="text-sm text-white/80 max-w-md">
            before you move a thing. Upload room photos, detect furniture with AI,
            and arrange the perfect layout in 2D or 3D.
          </p>
        </div>
      </header>

      {/* Quick Actions */}
      <div className="max-w-5xl mx-auto px-4 -mt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            className="card p-4 flex items-center gap-3 hover:shadow-medium transition-all group"
            onClick={() => setShowDialog(true)}
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center group-hover:bg-brand-100 transition-colors">
              <Plus className="w-5 h-5 text-brand-500" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold">New Room</div>
              <div className="text-[10px] text-surface-500">Start from scratch</div>
            </div>
          </button>

          <button
            className="card p-4 flex items-center gap-3 hover:shadow-medium transition-all group"
            onClick={() => {
              const id = createProject('Living room', 5.2, 4.2, 2.8);
              openProject(id);
              router.push(`/editor/${id}`);
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
              <Sofa className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold">Living Room</div>
              <div className="text-[10px] text-surface-500">5.2 × 4.2 m</div>
            </div>
          </button>

          <button
            className="card p-4 flex items-center gap-3 hover:shadow-medium transition-all group"
            onClick={() => {
              const id = createProject('Bedroom', 4.3, 4.5, 2.7);
              openProject(id);
              router.push(`/editor/${id}`);
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center group-hover:bg-violet-100 transition-colors">
              <BedDouble className="w-5 h-5 text-violet-600" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold">Bedroom</div>
              <div className="text-[10px] text-surface-500">4.3 × 4.5 m</div>
            </div>
          </button>

          <button
            className="card p-4 flex items-center gap-3 hover:shadow-medium transition-all group"
            onClick={() => {
              // Photo upload will be handled in the editor
              setShowDialog(true);
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
              <Camera className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold">From Photo</div>
              <div className="text-[10px] text-surface-500">AI-powered</div>
            </div>
          </button>
        </div>
      </div>

      {/* Projects */}
      <div className="max-w-5xl mx-auto px-4 mt-8">
        {/* Favorites */}
        {favorites.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <h3 className="font-semibold text-sm">Favorites</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {favorites.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={() => handleOpen(project.id)}
                  onFavorite={() => toggleFavorite(project.id)}
                  onDuplicate={() => duplicateProject(project.id)}
                  onDelete={() => deleteProject(project.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Recent */}
        {recent.length > 0 && (
          <section>
            <h3 className="font-semibold text-sm mb-4">
              {favorites.length > 0 ? 'Recent' : 'Your Rooms'}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {recent.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={() => handleOpen(project.id)}
                  onFavorite={() => toggleFavorite(project.id)}
                  onDuplicate={() => duplicateProject(project.id)}
                  onDelete={() => deleteProject(project.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {projects.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🏠</div>
            <h3 className="text-lg font-semibold mb-2">No rooms yet</h3>
            <p className="text-sm text-surface-500 mb-6 max-w-sm mx-auto">
              Create your first room or try one of the sample layouts to get started.
            </p>
            <button className="btn-primary" onClick={() => setShowDialog(true)}>
              <Plus className="w-4 h-4 mr-2 inline" />
              Create Your First Room
            </button>
          </div>
        )}
      </div>

      {/* Features Section */}
      <div className="max-w-5xl mx-auto px-4 mt-12">
        <div className="bg-gradient-to-br from-brand-50 to-surface-100 rounded-2xl p-6 md:p-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-brand-500" />
            <h3 className="font-semibold">AI-Powered Features</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: '📸',
                title: 'Photo Analysis',
                desc: 'Upload room photos and our AI detects furniture automatically',
              },
              {
                icon: '🎨',
                title: 'Image Processing',
                desc: 'Edge detection, contrast enhancement, and furniture removal',
              },
              {
                icon: '🏗️',
                title: '3D Visualization',
                desc: 'Walk through your room from inside, overview, or plan view',
              },
            ].map((feature) => (
              <div key={feature.title} className="bg-white/60 rounded-xl p-4">
                <div className="text-2xl mb-2">{feature.icon}</div>
                <h4 className="text-sm font-semibold mb-1">{feature.title}</h4>
                <p className="text-xs text-surface-500">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showDialog && (
        <NewRoomDialog onClose={() => setShowDialog(false)} onCreate={handleCreate} />
      )}
    </main>
  );
}
