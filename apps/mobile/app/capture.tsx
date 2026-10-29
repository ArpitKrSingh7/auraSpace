import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  Body,
  Button,
  Heading,
  Panel,
  Screen,
  Sheet,
  styles,
} from '../src/components/ui';
import { CalibrationReview } from '../src/features/capture/CalibrationReview';
import { CaptureReview } from '../src/features/capture/CaptureReview';
import { importCapture } from '../src/features/capture/controller';
import { RoomDetails } from '../src/features/editor/RoomDetails';
import { useStudio } from '../src/state/studio';
export default function CaptureScreen() {
  const router = useRouter(),
    params = useLocalSearchParams<{ projectId: string; captureId?: string }>(),
    doc = useStudio((s) => s.projects.find((p) => p.id === params.projectId)),
    [permission, requestPermission] = useCameraPermissions(),
    [cameraOpen, setCameraOpen] = React.useState(false),
    [ready, setReady] = React.useState(false),
    [busy, setBusy] = React.useState(false),
    [selected, setSelected] = React.useState<string | undefined>(
      params.captureId,
    ),
    [roomReview, setRoomReview] = React.useState(false),
    camera = React.useRef<CameraView>(null);
  if (!doc)
    return (
      <Screen>
        <Heading>Room not found</Heading>
        <Button title="Back to studio" onPress={() => router.replace('/')} />
      </Screen>
    );
  const notify = useStudio.getState().notify;
  const run = (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    void action()
      .catch((error) =>
        notify(
          error instanceof Error
            ? error.message
            : 'This photo could not be opened. Try the gallery or continue manually.',
        ),
      )
      .finally(() => setBusy(false));
  };
  const gallery = () =>
    run(async () => {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        notify(
          'Gallery access was not granted. You can use the camera or keep planning manually.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, 30 - doc.scene.captures.length),
        quality: 1,
        exif: true,
      });
      if (result.canceled) return;
      for (const asset of result.assets) {
        try {
          setSelected(await importCapture(doc.id, asset));
        } catch (error) {
          notify(
            error instanceof Error
              ? error.message
              : 'One photo could not be imported. Other photos remain saved.',
          );
        }
      }
    });
  const openCamera = () =>
    run(async () => {
      const granted = permission?.granted
        ? permission
        : await requestPermission();
      if (!granted.granted) {
        notify(
          'Camera permission was not granted. Import a photo or continue with manual dimensions.',
        );
        return;
      }
      setCameraOpen(true);
    });
  return (
    <Screen>
      <View style={styles.row}>
        <Heading>Bring your room in.</Heading>
        <Button compact secondary title="Back" onPress={() => router.back()} />
      </View>
      <Panel>
        <Body>
          For fuller coverage, take around 6–12 overlapping views, including
          corners, openings, and visible floor. Move between viewpoints and keep
          furniture still. Fewer photos are welcome; uncertain details remain
          editable.
        </Body>
        <View style={styles.row}>
          <Button title="Take photos" disabled={busy} onPress={openCamera} />
          <Button
            secondary
            title="Choose photos"
            disabled={busy}
            onPress={gallery}
          />
        </View>
        <Body>
          {doc.scene.captures.length} photos saved on this device. Analysis is
          optional; manual review is always available.
        </Body>
      </Panel>
      {doc.scene.captures.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {doc.scene.captures.map((c, i) => (
            <Button
              key={c.id}
              compact
              secondary={selected !== c.id}
              title={`Photo ${i + 1}`}
              onPress={() => setSelected(c.id)}
            />
          ))}
        </ScrollView>
      )}
      {selected && doc.scene.captures.some((c) => c.id === selected) && (
        <CaptureReview
          document={doc}
          captureId={selected}
          onReviewRoom={() => setRoomReview(true)}
        />
      )}
      <Button
        secondary
        title="Continue with manual room details"
        onPress={() => setRoomReview(true)}
      />
      <Button
        title="Arrange my room"
        onPress={() =>
          router.replace({ pathname: '/room/[id]', params: { id: doc.id } })
        }
      />
      <Sheet
        open={cameraOpen}
        title="Room capture"
        onClose={() => {
          setCameraOpen(false);
          setReady(false);
        }}
      >
        <View style={{ height: 390, borderRadius: 16, overflow: 'hidden' }}>
          {cameraOpen && (
            <CameraView
              ref={camera}
              style={{ flex: 1 }}
              facing="back"
              onCameraReady={() => setReady(true)}
              onMountError={() => {
                setCameraOpen(false);
                notify(
                  'The camera could not start. Choose a gallery photo or continue manually.',
                );
              }}
            />
          )}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              right: 12,
              backgroundColor: 'rgba(0,0,0,.45)',
              padding: 12,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: 'white', fontSize: 12 }}>
              Include corners, openings, and some floor. Keep overlapping the
              previous view.
            </Text>
          </View>
        </View>
        <Button
          title={busy ? 'Saving photo…' : 'Capture & keep taking photos'}
          disabled={!ready || busy}
          onPress={() =>
            run(async () => {
              const photo = await camera.current?.takePictureAsync({
                quality: 1,
                exif: true,
              });
              if (!photo)
                throw new Error(
                  'The camera did not return a photo. Please retry.',
                );
              setSelected(
                await importCapture(doc.id, {
                  ...photo,
                  mimeType: 'image/jpeg',
                  fileName: `Room photo ${doc.scene.captures.length + 1}`,
                }),
              );
              notify(
                'Photo saved on this device. Move a little for the next viewpoint.',
              );
            })
          }
        />
      </Sheet>
      <Sheet
        open={roomReview}
        title="Review your room"
        onClose={() => setRoomReview(false)}
      >
        {selected && <CalibrationReview document={doc} captureId={selected} onRetake={() => {
          setRoomReview(false);
          openCamera();
        }} />}
        <RoomDetails document={doc} />
      </Sheet>
    </Screen>
  );
}
