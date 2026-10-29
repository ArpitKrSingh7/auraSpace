import {
  type Observation,
  type ProjectDocument,
} from '@auraspace/scene-domain';
import { CATALOG } from '@auraspace/scene-domain/legacy/catalog';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { MediaImage } from '../../components/MediaImage';
import {
  Body,
  Button,
  Field,
  Heading,
  palette,
  Panel,
  Sheet,
  styles,
} from '../../components/ui';
import { cancelPendingCapture, queueProcessing } from '../../services/job-operations';
import { useStudio } from '../../state/studio';
import { BeforeAfter } from './BeforeAfter';
import {
  acceptJob,
  cancelProcessing,
  manualObservation,
  pollJob,
  startProcessing,
} from './controller';
import { MaskEditor } from './MaskEditor';
import { ProcessingEvidence } from './ProcessingEvidence';
import { typeEmoji } from '../editor/furniture-library-data';
export function CaptureReview({
  document: doc,
  captureId,
  onReviewRoom,
}: {
  document: ProjectDocument;
  captureId: string;
  onReviewRoom: () => void;
}) {
  const capture = doc.scene.captures.find((c) => c.id === captureId),
    [busy, setBusy] = React.useState(false),
    [editing, setEditing] = React.useState<string | null>(null),
    [linking, setLinking] = React.useState<string | null>(null),
    [removal, setRemoval] = React.useState<string[]>([]),
    [reviewedJob, setReviewedJob] = React.useState<string | null>(null),
    actionRunning = React.useRef(false);
  const execute = useStudio((s) => s.execute),
    notify = useStudio((s) => s.notify),
    jobId = capture?.jobId;
  const query = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => pollJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) =>
      q.state.data &&
      ['complete', 'review', 'failed', 'cancelled'].includes(
        q.state.data.status,
      )
        ? false
        : 2000,
    retry: 1,
  });
  if (!capture) return <Body>This photograph is no longer in the room.</Body>;
  const observations = doc.scene.observations.filter(
      (o) => o.captureImageId === captureId,
    ),
    selected = observations.find((o) => o.id === editing),
    job = query.data;
  const run = (action: () => Promise<unknown>) => {
    if (actionRunning.current) return;
    actionRunning.current = true;
    setBusy(true);
    void action()
      .catch((error) =>
        notify(
          error instanceof Error
            ? error.message
            : 'Please retry or continue manually.',
        ),
      )
      .finally(() => {
        actionRunning.current = false;
        setBusy(false);
      });
  };
  const update = (o: Observation) =>
    execute(doc.id, { type: 'observation', observation: o });
  return (
    <View style={{ gap: 18 }}>
      {capture.previewAssetId ? (
        <BeforeAfter
          originalId={capture.originalAssetId}
          previewId={capture.previewAssetId}
          ratio={capture.width / capture.height}
        />
      ) : (
        <MediaImage
          assetId={capture.originalAssetId}
          style={{
            width: '100%',
            aspectRatio: capture.width / capture.height,
            borderRadius: 14,
          }}
          resizeMode="contain"
        />
      )}
      {capture.error && (
        <Panel>
          <Body>{capture.error}</Body>
        </Panel>
      )}
      {capture.qualityWarnings.map((w) => (
        <Body key={w}>{w}</Body>
      ))}
      <Panel>
        <Heading small>Build a room draft</Heading>
        <Body>
          Estimate the visible floor and supported wall boundaries using indoor
          depth. Review the source, scale, and any possible openings before
          applying the draft to your room.
        </Body>
        <Button
          title="Build room from photo"
          disabled={
            busy ||
            (capture.status === 'queued' && !jobId) ||
            job?.status === 'running' ||
            job?.status === 'queued'
          }
          onPress={() => run(async () => {
            const nextJob = await queueProcessing(doc.id, [captureId], 'analyze', [], true);
            setReviewedJob(null);
            if (nextJob) notify('Room reconstruction queued. Review the completed processing result to see your draft.');
          })}
        />
        {capture.roomProposal && (
          <>
            <Body>
              {capture.roomProposal.status === 'estimated' && capture.roomProposal.source === 'model-estimated'
                ? `${capture.roomProposal.partial ? 'Partial visible floor' : 'Visible room estimate'} · ${capture.roomProposal.confidence} confidence · ${capture.roomProposal.method.replaceAll('-', ' ')}`
                : capture.roomProposal.source === 'placeholder'
                  ? 'This older result contains a manual starting guide. Build a fresh draft or mark the floor manually.'
                  : 'Room reconstruction needs more evidence. Retake the photo with more floor and a wall junction visible, or mark the floor manually.'}
            </Body>
            <Button secondary title="Review room draft & scale" onPress={onReviewRoom} />
          </>
        )}
        <Body>Hidden surfaces remain unverified. Furniture stays at its current size and position until you edit it.</Body>
      </Panel>
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        <Button
          title={observations.length ? 'Analyze again' : 'Find furniture'}
          disabled={
            busy ||
            (capture.status === 'queued' && !jobId) ||
            job?.status === 'running' ||
            job?.status === 'queued'
          }
          onPress={() =>
            run(async () => {
              const job = await startProcessing(
                doc.id,
                [captureId],
                'analyze',
                [],
                false,
              );
              setReviewedJob(null);
              if(job)notify('Analysis queued. You can keep arranging your room.');
            })
          }
        />
        <Button
          secondary
          title="Add a missed piece"
          onPress={() => {
            const observation = manualObservation(capture);
            execute(doc.id, { type: 'observation', observation });
            setEditing(observation.id);
          }}
        />
      </View>
      <Body>The library has more categories than photo detection. Add missed pieces manually and choose their category during review.</Body>
      {capture.status === 'queued' && !jobId && (
        <Panel>
          <Body>
            Waiting to upload and start processing. This request is saved and
            resumes when connected.
          </Body>
          <Button
            secondary
            title="Cancel queued request"
            onPress={() => run(() => cancelPendingCapture(doc.id, captureId))}
          />
        </Panel>
      )}
      {job && (
        <Panel>
          <Text style={{ fontSize: 13, fontWeight: '600', color: palette.ink }}>
            {job.status === 'review'
              ? 'Your result is ready to review'
              : job.status === 'failed'
                ? 'Analysis needs another try'
                : job.status === 'cancelled'
                  ? 'Processing cancelled'
                  : `Processing · ${job.stage.replaceAll('-', ' ')}`}
          </Text>
          {job.error && <Body>{job.error}</Body>}
          {job.status === 'review' && reviewedJob !== job.id && (
            <>
              <Body>
                Results are proposals. Your room dimensions and furniture
                placements stay as you set them.
              </Body>
              <Button
                title="Review processing result"
                disabled={busy}
                onPress={() =>
                  run(async () => {
                    await acceptJob(doc.id, job);
                    setReviewedJob(job.id);
                  })
                }
              />
            </>
          )}
          {['running', 'queued'].includes(job.status) && (
            <Button
              secondary
              title="Cancel processing"
              onPress={() =>
                run(() => cancelProcessing(job.id).then(() => query.refetch()))
              }
            />
          )}
        </Panel>
      )}
      {query.error && (
        <Panel>
          <Body>
            Status is temporarily unavailable. Processing may still be running
            on the server.
          </Body>
          <Button
            secondary
            title="Retry status"
            onPress={() => {
              void query.refetch();
            }}
          />
        </Panel>
      )}
      {!!observations.length && (
        <>
          <Heading small>Review your furniture</Heading>
          <Body>
            Keep movable pieces, correct a category, or link another view of the
            same physical item.
          </Body>
        </>
      )}
      {observations.map((o) => {
        const existing = doc.scene.items.find((i) =>
          i.observationIds.includes(o.id),
        );
        return (
          <Panel key={o.id}>
            <View style={styles.row}>
              <MediaImage
                assetId={o.thumbnailAssetId ?? capture.analysisAssetId}
                style={{ width: 65, height: 65, borderRadius: 10 }}
                resizeMode="contain"
              />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontWeight: '600', color: palette.ink }}>
                  {o.label ?? o.originalLabel}
                </Text>
                <Body>
                  {o.source === 'manual'
                    ? 'Manually outlined'
                    : `${Math.round((o.score ?? 0) * 100)}% detection confidence`}
                  {existing ? ` · Linked to ${existing.name}` : ''}
                </Body>
              </View>
            </View>
            <View style={[styles.row, { flexWrap: 'wrap' }]}>
              <Button
                compact
                secondary
                title="Review mask"
                onPress={() => setEditing(o.id)}
              />
              {!existing && !o.ignored && !o.fixed && (
                <Button
                  compact
                  title="Keep in tray"
                  onPress={() =>
                    execute(doc.id, { type: 'extract', observationId: o.id })
                  }
                />
              )}
              <Button
                compact
                secondary
                title={o.ignored ? 'Restore detection' : 'Ignore'}
                onPress={() => update({ ...o, ignored: !o.ignored })}
              />
            </View>
            <View style={styles.row}>
              <Body>Fixed / built-in: keep in photo</Body>
              <Switch
                value={o.fixed}
                onValueChange={(fixed) => {
                  update({ ...o, fixed, reviewed: true });
                  setRemoval((ids) => ids.filter((id) => id !== o.id));
                }}
                trackColor={{ true: palette.brand }}
              />
            </View>
            {!o.fixed && !o.ignored && (
              <View style={styles.row}>
                <Body>Remove in generated preview</Body>
                <Switch
                  value={removal.includes(o.id)}
                  onValueChange={(checked) => {
                    if (checked) update({ ...o, reviewed: true });
                    setRemoval((ids) =>
                      checked
                        ? [...ids, o.id]
                        : ids.filter((id) => id !== o.id),
                    );
                  }}
                  trackColor={{ true: palette.brand }}
                />
              </View>
            )}
            {!existing && doc.scene.items.length > 0 && (
              <Button
                secondary
                compact
                title="Same piece as an existing item…"
                onPress={() => setLinking(o.id)}
              />
            )}
          </Panel>
        );
      })}
      <Button
        title="Generate empty-room photo"
        disabled={
          busy ||
          !removal.length ||
          (capture.status === 'queued' && !jobId) ||
          job?.status === 'running' ||
          job?.status === 'queued'
        }
        onPress={() =>
          run(() => startProcessing(doc.id, [captureId], 'inpaint', removal))
        }
      />
      <Body>
        Hidden surfaces are synthesized. Your original stays intact. If
        restoration is poor, refine the mask or continue with the modeled room.
      </Body>
      <Button
        secondary
        title="Review room dimensions & boundaries"
        onPress={onReviewRoom}
      />
      <Button
        secondary
        title="Remove this photograph"
        onPress={() =>
          Alert.alert(
            'Remove photograph?',
            'Furniture already kept in your room stays available. You can undo this change in the editor.',
            [
              { text: 'Keep photo', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: () =>
                  run(async () => {
                    await cancelPendingCapture(doc.id, captureId);
                    if (jobId)
                      await cancelProcessing(jobId).catch(() => undefined);
                    execute(doc.id, { type: 'remove-capture', id: captureId });
                  }),
              },
            ],
          )
        }
      />
      <ProcessingEvidence
        document={doc}
        captureId={captureId}
        disabled={
          busy ||
          (capture.status === 'queued' && !jobId) ||
          job?.status === 'running' ||
          job?.status === 'queued'
        }
      />
      <Sheet
        open={!!selected}
        title="Correct the furniture selection"
        onClose={() => setEditing(null)}
      >
        {selected && (
          <>
            <Field
              label="Furniture label"
              value={selected.label ?? selected.originalLabel}
              maxLength={100}
              onChangeText={(name) =>
                update({ ...selected, label: name || 'Custom furniture' })
              }
            />
            <View style={[styles.row, { flexWrap: 'wrap' }]}>
              {CATALOG.map((entry) => (
                <Button
                  key={entry.type}
                  compact
                  secondary={selected.category !== entry.type}
                  title={`${typeEmoji[entry.type]} ${entry.name}`}
                  onPress={() =>
                    update({ ...selected, category: entry.type, reviewed: true })
                  }
                />
              ))}
            </View>
            {selected.rawMaskAssetId && (
              <Panel>
                <Body>Raw detection mask</Body>
                <MediaImage
                  assetId={selected.rawMaskAssetId}
                  style={{
                    width: '100%',
                    aspectRatio: capture.width / capture.height,
                  }}
                  resizeMode="contain"
                />
                <Body>Cleaned detection mask</Body>
                <MediaImage
                  assetId={selected.mask.artifactId}
                  style={{
                    width: '100%',
                    aspectRatio: capture.width / capture.height,
                  }}
                  resizeMode="contain"
                />
              </Panel>
            )}
            <MaskEditor
              capture={capture}
              observation={selected}
              onChange={(mask, box) =>
                update({
                  ...selected,
                  mask,
                  boxPx: box ?? selected.boxPx,
                  reviewed: true,
                })
              }
            />
          </>
        )}
      </Sheet>
      <Sheet
        open={!!linking}
        title="One piece, another photograph"
        onClose={() => setLinking(null)}
      >
        <Body>
          Link this observation to the physical piece you already have. Existing
          measurements will be preserved.
        </Body>
        {doc.scene.items.map((item) => (
          <Button
            key={item.id}
            secondary
            title={item.name}
            onPress={() => {
              if (linking)
                execute(doc.id, {
                  type: 'link-observation',
                  itemId: item.id,
                  observationId: linking,
                });
              setLinking(null);
            }}
          />
        ))}
      </Sheet>
    </View>
  );
}
