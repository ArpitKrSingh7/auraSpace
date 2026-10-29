'use client';

import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { Detection, FurnitureType } from '@/domain/types';
import { Camera, Check, Image } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { typeEmoji } from '../furniture-icons';
import { RoomReconstructionReview } from './RoomReconstructionReview';

export function PhotoUploadDialog({
  onClose,
  onOpenInspector,
}: {
  onClose: () => void;
  onOpenInspector?: () => void;
}) {
  const { addPhoto, addToast } = useAppStore();
  const project = useAppStore((s) => s.activeProject());
  const [analyzing, setAnalyzing] = useState(false);
  const lastPhoto = project?.photos[project.photos.length - 1];
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

  const handleFile = async (file: File) => {
    if (analyzing) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 8_000_000
    ) {
      addToast('Choose a JPG, PNG, or WebP image smaller than 8 MB.', 'error');
      return;
    }
    const originalProjectId = useAppStore.getState().activeProjectId;
    setAnalyzing(true);
    setFailed(false);
    setIsSample(false);
    setDetections([]);
    setAnalysisMessage('Opening your photo…');
    let id: string | null = null;
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('The file could not be read.'));
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const img = new window.Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () =>
          reject(new Error('This file is not a readable image.'));
        img.src = dataUri;
      });
      if (
        !img.naturalWidth ||
        img.naturalWidth * img.naturalHeight > 20_000_000
      )
        throw new Error('Choose a photo below 20 megapixels.');
      if (
        !mountedRef.current ||
        useAppStore.getState().activeProjectId !== originalProjectId
      )
        return;
      id = `photo-${crypto.randomUUID()}`;
      const photo = {
        id,
        uri: dataUri,
        width: img.naturalWidth,
        height: img.naturalHeight,
        name: file.name,
        detections: [] as Detection[],
        analysisStatus: 'running' as const,
      };
      setPreview(dataUri);
      setPhotoId(id);
      addPhoto(photo);
      const vision = await import('@/services/vision.web');
      const results = await vision.analyzePhoto(photo, (msg) => {
        if (mountedRef.current) setAnalysisMessage(msg);
      });
      // A result belongs to the project that requested it, even after navigation.
      useAppStore.getState().updatePhotoInProject(originalProjectId!, id, {
        detections: results,
        analysisStatus: 'complete',
      });
      if (mountedRef.current) {
        setDetections(results);
        setAnalysisMessage(
          results.length
            ? 'Review the furniture below. Dimensions use editable category defaults.'
            : 'No furniture detected. You can still add furniture from the library.',
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Analysis failed. You can add furniture manually.';
      if (id)
        useAppStore.getState().updatePhotoInProject(originalProjectId!, id, {
          analysisStatus: 'failed',
          analysisMessage: message,
        });
      if (mountedRef.current) {
        setFailed(true);
        setAnalysisMessage(message);
        addToast(message, 'warning');
      }
    } finally {
      if (mountedRef.current) setAnalyzing(false);
    }
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
      title="Bring your room in"
      maxWidth="max-w-lg"
    >
      <p className="mb-5 text-sm leading-relaxed text-surface-500">
        Choose a photo to build a room draft and find furniture. Review the room
        scale and keep the pieces you want in your tray.
      </p>

      {!preview ? (
        <div className="space-y-4">
          <button
            type="button"
            className="w-full border-2 border-dashed border-surface-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-all"
            onClick={() => fileInputRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <Camera className="w-10 h-10 text-surface-400 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">
              Drop a photo here or click to browse
            </p>
            <p className="text-xs text-surface-500">
              JPG, PNG, WebP · Up to 8 MB and 20 MP
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
          <div className="relative rounded-xl overflow-hidden">
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
          </div>

          <p
            role="status"
            className={`text-xs leading-relaxed ${failed ? 'text-amber-800' : 'text-surface-500'}`}
          >
            {isSample
              ? 'Illustrated sample · Predefined observations'
              : analysisMessage}
          </p>
          {currentPhoto && project && !isSample && (
            <RoomReconstructionReview key={currentPhoto.id} photo={currentPhoto} projectId={project.id} disabled={analyzing} />
          )}
          {detections.length > 0 && (
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
              Back to my room
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
              Upload Another
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handleFile(file);
        }}
      />
    </Dialog>
  );
}
