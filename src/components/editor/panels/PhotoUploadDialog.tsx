'use client';

import { PrivacyNotice } from '@/components/privacy/PrivacyNotice';
import { Dialog } from '@/components/ui/Dialog';
import type { Detection, FurnitureType, Photo } from '@/domain/types';
import { useAppStore } from '@/store/useAppStore';
import { Camera, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { typeEmoji } from '../furniture-icons';
import { RoomReconstructionReview } from './RoomReconstructionReview';

export function PhotoUploadDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const { addPhoto, addToast } = useAppStore();
  const project = useAppStore((s) => s.activeProject());
  const [analyzing, setAnalyzing] = useState(false);
  const lastPhoto = project?.photos.slice().reverse().find((p) => p.roomProposal) ?? project?.photos[project.photos.length - 1];
  const [preview, setPreview] = useState<string | null>(lastPhoto?.uri ?? null);
  const [detections, setDetections] = useState<Detection[]>(
    lastPhoto?.detections ?? [],
  );
  const [photoId, setPhotoId] = useState<string | null>(lastPhoto?.id ?? null);
  const [analysisMessage, setAnalysisMessage] = useState(
    lastPhoto?.analysisMessage ?? '',
  );
  const [isSample, setIsSample] = useState(lastPhoto?.name.endsWith('-sample-capture.jpg') ?? false);
  const currentPhoto = project?.photos.find((photo) => photo.id === photoId);
  const [failed, setFailed] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: File[]) => {
    if (analyzing || !files.length) return;
    const originalProjectId = useAppStore.getState().activeProjectId;
    if (!originalProjectId) return;
    const photos: Photo[] = [];
    let skipped = Math.max(0, files.length - 5);
    setAnalyzing(true); setFailed(false); setIsSample(false); setDetections([]);
    setAnalysisMessage('Opening your room photos…');
    try {
      for (const file of files.slice(0, 5)) {
        try {
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8_000_000)
            throw new Error('Unsupported file');
          const dataUri = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Unreadable file'));
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          const img = new window.Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve(); img.onerror = () => reject(new Error('Unreadable image')); img.src = dataUri;
          });
          if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > 20_000_000) throw new Error('Image too large');
          // Store bounded previews so several phone photos fit browser storage.
          const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Image processing unavailable');
          context.drawImage(img, 0, 0, canvas.width, canvas.height);
          const photo: Photo = { id: `photo-${crypto.randomUUID()}`, uri: canvas.toDataURL('image/jpeg', .8),
            width: canvas.width, height: canvas.height, name: file.name, detections: [], analysisStatus: 'running' };
          photos.push(photo);
        } catch { skipped++; }
      }
      if (!mountedRef.current || useAppStore.getState().activeProjectId !== originalProjectId) return;
      if (!photos.length) throw new Error('Choose a readable JPG, PNG or WebP below 8 MB and 20 MP.');
      if ((useAppStore.getState().activeProject()?.photos.length ?? 0) + photos.length > 30)
        throw new Error('This project already has too many photos. Start a new room for this set.');
      for (const photo of photos) addPhoto(photo);
      setPreview(photos[0].uri); setPhotoId(photos[0].id);
      if (skipped) addToast(`${photos.length} photos opened. ${skipped} unreadable, oversized or extra files were skipped.`, 'warning');
      const { analyzeRoomViews } = await import('@/services/vision.web');
      const result = await analyzeRoomViews(photos, (msg) => { if (mountedRef.current) setAnalysisMessage(msg); });
      for (const update of result.updates) {
        useAppStore.getState().updatePhotoInProject(originalProjectId, update.photoId, {
          detections: update.detections, analysisStatus: update.analyzed ? 'complete' : 'idle',
          ...(update.photoId === result.anchorPhotoId ? { roomProposal: result.roomProposal } : {}),
        });
      }
      if (mountedRef.current) {
        const anchor = photos.find((p) => p.id === result.anchorPhotoId)!;
        setPhotoId(anchor.id); setPreview(anchor.uri);
        setAnalysisMessage('Your draft is ready. Check the furniture, then open your room.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis could not finish. You can mark furniture manually.';
      for (const photo of photos) useAppStore.getState().updatePhotoInProject(originalProjectId, photo.id, { analysisStatus: 'failed', analysisMessage: message });
      if (mountedRef.current) { setFailed(true); setAnalysisMessage(message); addToast(message, 'warning'); }
    } finally { if (mountedRef.current) setAnalyzing(false); }
  };

  const loadPresetSample = (type: 'living' | 'bedroom') => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = type === 'living' ? '#EDE7DE' : '#E7E5DA';
    ctx.fillRect(0, 0, 800, 320);
    ctx.fillStyle = type === 'living' ? '#C9A982' : '#D4B797';
    ctx.fillRect(0, 320, 800, 220);

    ctx.fillStyle = '#C2B8A8';
    ctx.fillRect(0, 310, 800, 10);

    if (type === 'living') {
      ctx.fillStyle = '#8C9D88';
      ctx.beginPath();
      ctx.rect(140, 240, 320, 180);
      ctx.fill();

      ctx.fillStyle = '#C9977D';
      ctx.beginPath();
      ctx.rect(520, 260, 160, 160);
      ctx.fill();

      ctx.fillStyle = '#B58A60';
      ctx.beginPath();
      ctx.rect(260, 410, 220, 90);
      ctx.fill();
    } else {
      ctx.fillStyle = '#C9B9A5';
      ctx.beginPath();
      ctx.rect(220, 200, 360, 260);
      ctx.fill();

      ctx.fillStyle = '#A7835E';
      ctx.beginPath();
      ctx.rect(120, 300, 80, 120);
      ctx.fill();
    }

    const dataUri = canvas.toDataURL('image/jpeg', 0.9);
    setPreview(dataUri);
    setIsSample(true);
    setFailed(false);
    setAnalysisMessage(
      'Illustrated sample with predefined observations. No model was run.',
    );

    const sampleDetections =
      type === 'living'
        ? [
            {
              id: `det-${Date.now()}-1`,
              label: 'couch',
              type: 'sofa' as const,
              score: 0.94,
              box: [140, 240, 320, 180] as [number, number, number, number],
              source: 'manual' as const,
            },
            {
              id: `det-${Date.now()}-2`,
              label: 'chair',
              type: 'chair' as const,
              score: 0.88,
              box: [520, 260, 160, 160] as [number, number, number, number],
              source: 'manual' as const,
            },
            {
              id: `det-${Date.now()}-3`,
              label: 'dining table',
              type: 'table' as const,
              score: 0.82,
              box: [260, 410, 220, 90] as [number, number, number, number],
              source: 'manual' as const,
            },
          ]
        : [
            {
              id: `det-${Date.now()}-1`,
              label: 'bed',
              type: 'bed' as const,
              score: 0.96,
              box: [220, 200, 360, 260] as [number, number, number, number],
              source: 'manual' as const,
            },
            {
              id: `det-${Date.now()}-2`,
              label: 'chair',
              type: 'chair' as const,
              score: 0.79,
              box: [120, 300, 80, 120] as [number, number, number, number],
              source: 'manual' as const,
            },
          ];

    const photo = {
      id: `photo-${Date.now()}`,
      uri: dataUri,
      width: 800,
      height: 540,
      name: `${type}-sample-capture.jpg`,
      detections: sampleDetections,
      analysisStatus: 'complete' as const,
    };

    addPhoto(photo);
    setPhotoId(photo.id);
    setDetections(sampleDetections);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={preview ? 'Review your room' : 'Bring your room in'}
      maxWidth="max-w-lg"
    >
      {!preview && <p className="mb-5 text-sm leading-relaxed text-surface-500">
        Upload 1–5 photos of the same room. We’ll find furniture and put it into an editable
        starting layout for you.
      </p>}

      {!preview && <PrivacyNotice className="mb-5" />}

      {!preview ? (
        <div className="space-y-4">
          <section
            aria-label="Room photo tips"
            className="rounded-xl border border-brand-200 bg-brand-50/50 p-3"
          >
            <h3 className="text-xs font-semibold text-brand-800">
              Get a better room draft
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-surface-600">
              One photo is enough to start. For a better draft, add 3–5 overlapping views while moving around the room. Keep some of the same furniture and floor visible in neighbouring photos.
            </p>
            <details className="mt-2 text-xs text-surface-600">
              <summary className="cursor-pointer font-medium text-brand-700">
                More photo tips
              </summary>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 leading-relaxed">
                <li>Move a few steps between views; don’t only turn in one spot. Include floor and two adjoining walls where possible.</li>
                <li>Use the normal 1× camera; avoid panoramas and ultra-wide shots.</li>
                <li>Keep the phone level from side to side and avoid steep up/down angles.</li>
                <li>Use good lighting and hold steady so floor and wall edges stay clear.</li>
                <li>Measure a visible floor length, such as across a few tiles, to calibrate scale.</li>
              </ul>
              <p className="mt-2 leading-relaxed">
                Blurry or difficult views stay available as references. You can continue with the photos you have; hidden walls and exact dimensions still need review.
              </p>
            </details>
          </section>
          <button
            type="button"
            className="w-full border-2 border-dashed border-surface-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-all"
            onClick={() => fileInputRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              void handleFiles(Array.from(e.dataTransfer.files));
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <Camera className="w-10 h-10 text-surface-400 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">
              Choose room photos
            </p>
            <p className="text-xs text-surface-500">
              1–5 photos · JPG, PNG, WebP · Up to 8 MB and 20 MP each
            </p>
          </button>

          <div className="pt-2 border-t border-surface-200">
            <p className="text-xs font-semibold text-surface-600 mb-2">
              Or explore an illustrated example:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="btn-secondary text-xs py-2 px-3 flex items-center justify-center gap-1.5"
                onClick={() => loadPresetSample('living')}
              >
                🛋️ Living Room Sample
              </button>
              <button
                type="button"
                className="btn-secondary text-xs py-2 px-3 flex items-center justify-center gap-1.5"
                onClick={() => loadPresetSample('bedroom')}
              >
                🛏️ Bedroom Sample
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {(analyzing || isSample) && <div className="relative rounded-xl overflow-hidden">
            <img src={preview} alt="Room" className="w-full rounded-xl" />
            {analyzing && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <div className="bg-white rounded-xl px-4 py-3 flex items-center gap-2 shadow-lg">
                  <div className="animate-spin w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full" />
                  <span className="text-xs">
                    {analysisMessage || 'Finding furniture…'}
                  </span>
                </div>
              </div>
            )}
          </div>}

          <p
            role="status"
            className={`text-xs leading-relaxed ${failed ? 'text-amber-800' : 'text-surface-500'}`}
          >
            {isSample
              ? 'Illustrated sample · Predefined observations'
              : analysisMessage}
          </p>
          {currentPhoto && project && !isSample && !analyzing && (
            <RoomReconstructionReview key={currentPhoto.id} photo={currentPhoto} projectId={project.id} disabled={analyzing} onDone={onClose} onAnchorChange={(id) => { setPhotoId(id); setPreview(project.photos.find((p) => p.id === id)?.uri ?? null); }} />
          )}
          {isSample && detections.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Detected Furniture</h3>
              <div className="space-y-2">
                {detections.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-surface-50 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {typeEmoji[d.type as FurnitureType] || '📦'}
                      </span>
                      <div>
                        <div className="text-sm font-medium capitalize">
                          {d.label}
                        </div>
                        <div className="text-[10px] text-surface-500">
                          {d.source === 'manual'
                            ? 'Predefined example'
                            : `Confidence: ${(d.score * 100).toFixed(0)}%`}
                        </div>
                      </div>
                    </div>
                    <button
                      className="btn-primary text-xs py-1.5 px-3"
                      disabled={project?.items.some(
                        (item) =>
                          item.photoId === photoId && item.detectionId === d.id,
                      )}
                      onClick={() => {
                        if (photoId)
                          useAppStore
                            .getState()
                            .addDetectionAsItem(photoId, d.id);
                      }}
                    >
                      {project?.items.some(
                        (item) =>
                          item.photoId === photoId && item.detectionId === d.id,
                      )
                        ? 'In tray'
                        : 'Keep item'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              className="flex-1 btn-primary text-xs py-2.5 flex items-center justify-center gap-1.5"
              disabled={analyzing}
              onClick={() => {
                onClose();
              }}
            >
              <Check className="w-3.5 h-3.5" />
              {isSample ? 'Back to my room' : 'Cancel'}
            </button>
            <button
              className="flex-1 btn-secondary text-xs py-2.5"
              disabled={analyzing}
              onClick={() => {
                setPreview(null);
                setDetections([]);
                setAnalysisMessage('');
              }}
            >
              Use different photos
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void handleFiles(files);
        }}
      />
    </Dialog>
  );
}
