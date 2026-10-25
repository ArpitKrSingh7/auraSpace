import type { ProjectDocument } from '@auraspace/scene-domain';
import React from 'react';
import { Text, View } from 'react-native';
import { MediaImage } from '../../components/MediaImage';
import {
  Body,
  Button,
  Heading,
  palette,
  Panel,
  styles,
} from '../../components/ui';
import { queueProcessing } from '../../services/job-operations';
import { useStudio } from '../../state/studio';
export function ProcessingEvidence({
  document,
  captureId,
  disabled,
}: {
  document: ProjectDocument;
  captureId: string;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false),
    [busy, setBusy] = React.useState(false),
    capture = document.scene.captures.find((c) => c.id === captureId);
  if (!capture) return null;
  const run = (
    operation?:
      'grayscale' | 'contrast' | 'clahe' | 'edges' | 'contours' | 'histogram',
  ) => {
    setBusy(true);
    void queueProcessing(
      document.id,
      [captureId],
      operation ? 'process' : 'analyze',
      [],
      !operation,
      operation,
    )
      .catch((e) =>
        useStudio
          .getState()
          .notify(
            e instanceof Error
              ? e.message
              : 'Try processing again when connected.',
          ),
      )
      .finally(() => setBusy(false));
  };
  return (
    <Panel>
      <Button
        secondary
        title={open ? 'Hide processing tools' : 'Processing & depth tools'}
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <Body>
            Optional inspection tools. They do not change your source photo,
            furniture dimensions, or room layout. Review the completed job above
            to keep its output.
          </Body>
          <View
            style={[
              styles.row,
              { flexWrap: 'wrap', justifyContent: 'flex-start' },
            ]}
          >
            {(
              [
                'grayscale',
                'contrast',
                'clahe',
                'edges',
                'contours',
                'histogram',
              ] as const
            ).map((op) => (
              <Button
                compact
                secondary
                key={op}
                title={op === 'clahe' ? 'CLAHE' : op}
                disabled={disabled || busy}
                onPress={() => run(op)}
              />
            ))}
          </View>
          <Button
            secondary
            title="Analyze with indoor depth"
            disabled={disabled || busy}
            onPress={() => run()}
          />
          <Body>
            Depth uses a server model when configured. Learned estimates require
            measurements; a color map alone does not establish room size.
          </Body>
          {capture.processingEvidence && (
            <View style={{ gap: 5 }}>
              {Object.entries(capture.processingEvidence.models).map(
                ([key, value]) => (
                  <Text
                    selectable
                    key={key}
                    style={{ fontSize: 11, color: palette.secondary }}
                  >
                    {key}: {value}
                  </Text>
                ),
              )}
              {Object.entries(capture.processingEvidence.timingsMs).map(
                ([key, value]) => (
                  <Body key={key}>
                    {key}: {(value / 1000).toFixed(2)} s on the processing
                    server
                  </Body>
                ),
              )}
            </View>
          )}
          {capture.processingAssets
            ?.filter((a) => !a.label.startsWith('Raw depth'))
            .map((a) => (
              <View key={a.assetId} style={{ gap: 8 }}>
                <Heading small>{a.label}</Heading>
                <MediaImage
                  assetId={a.assetId}
                  style={{
                    width: '100%',
                    aspectRatio: capture.width / capture.height,
                    borderRadius: 12,
                  }}
                  resizeMode="contain"
                />
              </View>
            ))}
          <Body>
            Raw metric depth, when available, is included in the portable
            project as a lossless 16-bit PNG in millimeters.
          </Body>
        </>
      )}
    </Panel>
  );
}
