'use client';

import { PrivacyNotice } from '@/components/privacy/PrivacyNotice';
import { RoomPreview } from '@/components/projects/RoomPreview';
import { Dialog } from '@/components/ui/Dialog';
import type { Project } from '@/domain/types';
import { MAX_IMPORT_BYTES, parseProjectJson } from '@/domain/validation';
import { useAppStore } from '@/store/useAppStore';
import {
  ArrowDownUp,
  ArrowRight,
  Box,
  Camera,
  Check,
  ChevronRight,
  Copy,
  FolderOpen,
  Grid2X2,
  Heart,
  Import,
  LayoutTemplate,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Filter = 'all' | 'favorites' | 'samples';

function NewRoomDialog({
  photo,
  onClose,
}: {
  photo: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('My new room');
  const [dimensions, setDimensions] = useState([5.2, 4.2, 2.8]);
  return (
    <Dialog
      open
      onClose={onClose}
      title={
        photo ? 'Start with your room photo' : 'A little room for possibility'
      }
    >
      <p className="mb-5 text-sm text-surface-500">
        {photo
          ? 'For best results, take a photo from a corner or doorway with plenty of floor and two adjoining walls visible. Review the estimated room and furniture before applying them.'
          : 'Give your space a name and set its dimensions. You can refine everything in the editor.'}
      </p>
      {photo && <PrivacyNotice className="mb-5" />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const id = useAppStore
            .getState()
            .createProject(name, dimensions[0], dimensions[1], dimensions[2]);
          if (photo) useAppStore.getState().updateRoom({ openings: [] });
          router.push(`/editor/${id}${photo ? '?capture=1' : ''}`);
        }}
        className="space-y-5"
      >
        <label className="block space-y-2">
          <span className="label">Room name</span>
          <input
            className="input-field"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {!photo && <div className="grid grid-cols-3 gap-3">
          {['Width', 'Depth', 'Height'].map((label, i) => (
            <label key={label} className="block space-y-2">
              <span className="label">{label} (m)</span>
              <input
                className="input-field"
                type="number"
                required
                min={i === 2 ? 1.5 : 1}
                max={i === 2 ? 12 : 40}
                step="0.1"
                value={dimensions[i]}
                onChange={(e) =>
                  setDimensions((d) =>
                    d.map((v, n) => (n === i ? Number(e.target.value) : v)),
                  )
                }
              />
            </label>
          ))}
        </div>}
        {!photo && <div className="flex items-center justify-between rounded-xl bg-surface-100 p-4">
          <span className="text-xs text-surface-500">Your blank canvas</span>
          <span className="text-xl text-brand-600">
            {(dimensions[0] * dimensions[1]).toFixed(1)}{' '}
            <span className="text-sm">m²</span>
          </span>
        </div>}
        <div className="flex gap-3">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn-primary flex-1">
            {photo ? 'Continue to photos' : 'Create room'}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: Project;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const store = useAppStore();
  const count = project.items.filter((i) => i.placed).length;
  return (
    <article className="group overflow-hidden rounded-2xl border border-surface-200 bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-medium">
      <div className="relative bg-surface-100">
        <button
          className="block w-full overflow-hidden text-left"
          onClick={onOpen}
          aria-label={`Open ${project.name}`}
        >
          <RoomPreview
            project={project}
            className="h-48 w-full transition-transform duration-500 group-hover:scale-105"
          />
        </button>
        <span className="absolute left-3 top-3 rounded-md border border-white/80 bg-white/80 px-2 py-1 text-[10px] font-medium text-surface-600">
          {project.sample ? 'SAMPLE ROOM' : 'YOUR ROOM'}
        </span>
        <button
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-surface-500 hover:text-brand-600"
          aria-label={`${project.favorite ? 'Unfavorite' : 'Favorite'} ${project.name}`}
          aria-pressed={project.favorite}
          onClick={() => store.toggleFavorite(project.id)}
        >
          <Heart
            size={15}
            className={project.favorite ? 'fill-brand-500 text-brand-500' : ''}
          />
        </button>
      </div>
      <div className="p-4">
        <button
          onClick={onOpen}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <h3 className="truncate font-semibold tracking-tight">
            {project.name}
          </h3>
          <ArrowRight
            size={16}
            className="shrink-0 text-surface-400 transition-transform group-hover:translate-x-1"
          />
        </button>
        <p className="mt-1.5 text-xs text-surface-500">
          {project.room.width} × {project.room.depth} m{' '}
          <span className="px-1.5 text-surface-300">/</span> {count} items
          placed
        </p>
        <div className="mt-4 flex items-center justify-between border-t border-surface-100 pt-3">
          <span className="text-[11px] text-surface-500">
            {project.sample
              ? 'Ready to explore'
              : `Edited ${new Date(project.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
          </span>
          <div className="flex gap-1">
            <button
              className="rounded-md p-2 text-surface-500 hover:bg-surface-100"
              onClick={() => {
                store.duplicateProject(project.id);
                store.addToast('Room duplicated', 'success');
              }}
              aria-label={`Duplicate ${project.name}`}
            >
              <Copy size={14} />
            </button>
            {!project.sample && (
              <button
                className="rounded-md p-2 text-surface-500 hover:bg-red-50 hover:text-red-600"
                onClick={onDelete}
                aria-label={`Delete ${project.name}`}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { projects, openProject, settings, updateSettings, addToast } =
    useAppStore();
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [newRoom, setNewRoom] = useState<'manual' | 'photo' | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(
      settings.reduceMotion,
    );
  }, [settings.reduceMotion]);
  const open = (id: string) => {
    openProject(id);
    router.push(`/editor/${id}`);
  };
  const visible = projects
    .filter(
      (p) =>
        (filter !== 'favorites' || p.favorite) &&
        (filter !== 'samples' || p.sample) &&
        p.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
  const featured = projects.find((p) => p.cover === 'living') ?? projects[0];
  if (!mounted)
    return (
      <div className="flex min-h-screen items-center justify-center text-brand-600">
        Opening your studio…
      </div>
    );
  return (
    <main className="min-h-screen bg-[#faf9f6] text-surface-800">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r border-surface-200 bg-[#f4f3ed] p-5 lg:flex">
        <a
          href="/"
          className="mb-12 mt-3 flex items-center gap-2.5 text-xl font-semibold tracking-tight"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white">
            <Box size={21} strokeWidth={1.5} />
          </span>
          AuraSpace<span className="mb-3 text-xs text-brand-500">®</span>
        </a>
        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-surface-500">
          Workspace
        </p>
        <nav className="space-y-1" aria-label="Workspace">
          {[
            { id: 'all', label: 'All rooms', icon: Grid2X2 },
            { id: 'favorites', label: 'Favorites', icon: Heart },
            { id: 'samples', label: 'Sample rooms', icon: LayoutTemplate },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`studio-nav ${filter === id ? 'studio-nav-active' : ''}`}
              aria-current={filter === id ? 'page' : undefined}
              onClick={() => setFilter(id as Filter)}
            >
              <Icon size={17} strokeWidth={1.7} />
              {label}
              {id === 'all' && (
                <span className="ml-auto text-xs">{projects.length}</span>
              )}
            </button>
          ))}
        </nav>
        <button
          className="studio-nav mt-7"
          onClick={() => importRef.current?.click()}
        >
          <Import size={17} />
          Import project
        </button>
        <div className="mt-auto rounded-2xl border border-[#dce2d4] bg-[#e9eee2] p-4">
          <span className="mb-3 inline-flex rounded-lg bg-white/60 p-2 text-brand-500">
            <Sparkles size={18} />
          </span>
          <h3 className="text-sm font-semibold">A fresh perspective.</h3>
          <p className="mb-4 mt-2 text-xs leading-relaxed text-surface-600">
            Try a sample room and make a little space for your ideas.
          </p>
          <button
            className="flex items-center gap-2 text-xs font-semibold text-brand-600"
            onClick={() => {
              setFilter('samples');
              setSearch('');
            }}
          >
            Explore samples
            <ArrowRight size={14} />
          </button>
        </div>
        <button
          className="mt-5 flex items-center gap-3 border-t border-surface-200 pt-5 text-left"
          onClick={() => setShowSettings(true)}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4e5db] text-xs font-semibold text-brand-600">
            {settings.displayName.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">
              {settings.displayName}
            </span>
            <span className="text-[10px] text-surface-500">
              Local workspace
            </span>
          </span>
          <Settings2 size={15} />
        </button>
      </aside>
      <div className="lg:ml-56">
        <header className="flex h-20 items-center justify-between border-b border-surface-200 px-5 sm:px-9 xl:px-12">
          <div className="flex items-center gap-2 text-xs text-surface-500">
            <Box size={19} className="text-brand-500 lg:hidden" />
            <span className="hidden sm:inline">Workspace</span>
            <ChevronRight size={12} className="hidden sm:block" />
            <span className="font-medium text-surface-800">Your studio</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-1.5 text-[11px] text-surface-500 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
              Saved on this device
            </span>
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Studio settings"
              className="rounded-lg border border-surface-200 p-2 text-surface-600"
            >
              <Settings2 size={17} />
            </button>
          </div>
        </header>
        <div className="mx-auto max-w-[1440px] px-5 pb-10 pt-8 sm:px-9 xl:px-12">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-brand-500">
                A space to make your own
              </p>
              <h1 className="studio-heading text-4xl sm:text-[44px]">
                Good things start with a room.
              </h1>
              <p className="mt-3 text-sm text-surface-500">
                Reimagine the everyday. Design a space that feels like you.
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={() => setNewRoom('manual')}
            >
              <Plus size={17} />
              New room
            </button>
          </div>
          <section
            className="relative mb-7 grid overflow-hidden rounded-[22px] border border-[#dce2d4] bg-[#e9eee2] md:grid-cols-[1.1fr_1fr]"
            aria-label="Start designing"
          >
            <div className="relative z-10 p-6 sm:p-8">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-300/40 bg-white/50 px-2.5 py-1 text-[10px] font-medium text-brand-600">
                <Sparkles size={12} />
                Your room, reimagined
              </span>
              <h2 className="studio-heading mb-3 mt-5 text-[34px] leading-[1.13] sm:text-[40px]">
                See the possibility.
                <br />
                <span className="text-brand-500">Before you move a thing.</span>
              </h2>
              <p className="max-w-sm text-xs leading-6 text-surface-600">
                Start with a photo or a blank canvas. Explore your layout in 3D,
                find the right fit, and bring your ideas home.
              </p>
              <button
                className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-brand-600"
                onClick={() => setNewRoom('photo')}
              >
                Start with a photo
                <ArrowRight size={15} />
              </button>
            </div>
            <div className="studio-grid relative flex min-h-52 items-center justify-center md:min-h-full">
              {featured && (
                <RoomPreview
                  project={featured}
                  className="w-full max-w-lg scale-110"
                />
              )}
              <span className="absolute bottom-4 right-5 rounded-full bg-white/80 px-3 py-1.5 text-[10px] text-brand-600">
                An idea of what’s possible
              </span>
            </div>
          </section>
          <div className="mb-10 grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: Plus,
                title: 'Start from scratch',
                text: 'Your dimensions. Your vision.',
                action: () => setNewRoom('manual'),
              },
              {
                icon: Camera,
                title: 'Bring your room in',
                text: 'Import a photo to get started.',
                action: () => setNewRoom('photo'),
              },
              {
                icon: FolderOpen,
                title: 'Pick up where you left off',
                text: 'Import a saved project file.',
                action: () => importRef.current?.click(),
              },
            ].map(({ icon: Icon, title, text, action }) => (
              <button
                key={title}
                onClick={action}
                className="group flex items-center gap-3 rounded-xl border border-surface-200 bg-white p-4 text-left transition-colors hover:border-brand-300"
              >
                <span className="rounded-xl bg-surface-100 p-2.5 text-brand-500">
                  <Icon size={18} strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold">{title}</span>
                  <span className="mt-1 block text-[11px] text-surface-500">
                    {text}
                  </span>
                </span>
                <ChevronRight
                  size={15}
                  className="text-surface-400 group-hover:text-brand-500"
                />
              </button>
            ))}
          </div>
          <section aria-label="Room projects">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold tracking-tight">
                  Your rooms
                </h2>
                <span className="rounded-md bg-surface-100 px-2 py-1 text-[11px] text-surface-600">
                  {projects.length}
                </span>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <label className="relative min-w-0 flex-1">
                  <Search
                    size={15}
                    className="absolute left-3 top-3 text-surface-400"
                  />
                  <input
                    className="input-field pl-9 sm:w-52"
                    aria-label="Search rooms"
                    placeholder="Find a room…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <label className="flex items-center gap-1 rounded-xl border border-surface-200 bg-white px-2 text-surface-500">
                  <ArrowDownUp size={14} />
                  <select
                    className="max-w-28 bg-transparent py-2 text-xs outline-none"
                    aria-label="Sort rooms"
                    value={sort}
                    onChange={(e) =>
                      setSort(e.target.value as 'recent' | 'name')
                    }
                  >
                    <option value="recent">Last edited</option>
                    <option value="name">Name A–Z</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="mb-5 flex gap-5 border-b border-surface-200 lg:hidden">
              {[
                { id: 'all', label: 'All rooms' },
                { id: 'favorites', label: 'Favorites' },
                { id: 'samples', label: 'Samples' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  className={`border-b-2 pb-3 text-xs font-medium ${filter === id ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-500'}`}
                  onClick={() => setFilter(id as Filter)}
                  aria-pressed={filter === id}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={() => open(project.id)}
                  onDelete={() => setDeleteTarget(project)}
                />
              ))}
              {!search && filter === 'all' && (
                <button
                  className="group flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-surface-300 bg-surface-100/40 p-8 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/50"
                  onClick={() => setNewRoom('manual')}
                >
                  <span className="mb-4 rounded-full border border-surface-200 bg-white p-3 text-brand-500">
                    <Plus size={22} strokeWidth={1.5} />
                  </span>
                  <span className="text-sm font-semibold">
                    Room for another idea
                  </span>
                  <span className="mt-2 text-xs text-surface-500">
                    Create a new space to explore
                  </span>
                </button>
              )}
            </div>
            {visible.length === 0 && (
              <div className="py-12 text-center">
                <Search size={26} className="mx-auto mb-4 text-surface-400" />
                <p className="text-sm font-medium">
                  {search
                    ? 'No rooms match your search.'
                    : filter === 'favorites'
                      ? 'Your favorite spaces will live here.'
                      : 'No rooms here yet.'}
                </p>
                <button
                  className="btn-ghost mt-3 text-brand-600"
                  onClick={() => {
                    setSearch('');
                    setFilter('all');
                  }}
                >
                  View all rooms
                </button>
              </div>
            )}
          </section>
          <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-surface-200 pt-5 text-[10px] text-surface-500">
            <span>A little planning. A lot of possibility.</span>
            <span className="flex items-center gap-1.5">
              <Check size={12} />
              Local workspace · Export a copy to keep a backup
            </span>
          </footer>
        </div>
      </div>
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="Import project file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            if (file.size > MAX_IMPORT_BYTES)
              throw new Error('Choose a project file smaller than 24 MB.');
            const project = parseProjectJson(await file.text());
            const id = useAppStore.getState().importProject(project);
            addToast('Project imported', 'success');
            open(id);
          } catch (error) {
            addToast(
              error instanceof Error
                ? error.message
                : 'Could not import this file.',
              'error',
            );
          }
        }}
      />
      {newRoom && (
        <NewRoomDialog
          photo={newRoom === 'photo'}
          onClose={() => setNewRoom(null)}
        />
      )}
      <Dialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        title="Your studio"
      >
        <div className="space-y-5">
          <label className="block space-y-2">
            <span className="label">Workspace name</span>
            <input
              className="input-field"
              maxLength={60}
              value={settings.displayName}
              onChange={(e) => updateSettings({ displayName: e.target.value })}
            />
          </label>
          {[
            {
              key: 'snap' as const,
              title: 'Snap furniture to the grid',
              desc: 'Place items in 10 cm increments.',
            },
            {
              key: 'showGrid' as const,
              title: 'Show the floor grid',
              desc: 'A guide for arranging your space.',
            },
            {
              key: 'reduceMotion' as const,
              title: 'Reduce motion',
              desc: 'Keep interface transitions minimal.',
            },
          ].map((option) => (
            <label
              key={option.key}
              className="flex items-center justify-between gap-4"
            >
              <span>
                <span className="block text-sm font-medium">
                  {option.title}
                </span>
                <span className="text-xs text-surface-500">{option.desc}</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-[#3e6658]"
                checked={settings[option.key]}
                onChange={(e) =>
                  updateSettings({ [option.key]: e.target.checked })
                }
              />
            </label>
          ))}
          <PrivacyNotice />
          <button
            className="btn-primary w-full"
            onClick={() => setShowSettings(false)}
          >
            Done
          </button>
        </div>
      </Dialog>
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete this room?"
      >
        <p className="mb-5 text-sm text-surface-500">
          “{deleteTarget?.name}” and its saved layouts will be removed from this
          device.
        </p>
        <div className="flex gap-3">
          <button
            className="btn-secondary flex-1"
            onClick={() => setDeleteTarget(null)}
          >
            Keep room
          </button>
          <button
            className="btn-primary flex-1 bg-red-700 hover:bg-red-800"
            onClick={() => {
              if (deleteTarget)
                useAppStore.getState().deleteProject(deleteTarget.id);
              setDeleteTarget(null);
            }}
          >
            Delete room
          </button>
        </div>
      </Dialog>
    </main>
  );
}
