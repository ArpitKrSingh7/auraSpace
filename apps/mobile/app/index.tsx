import { bounds, forkDocument,migrateLegacyProject } from '@auraspace/scene-domain';
import { createSampleProjects } from '@auraspace/scene-domain/legacy/catalog';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import {
  Body,
  Button,
  Field,
  Heading,
  palette,
  Panel,
  Screen,
  Sheet,
  styles,
} from '../src/components/ui';
import { importPortable } from '../src/services/sharing';
import { useStudio } from '../src/state/studio';
export default function Studio() {
  const router = useRouter(),
    projects = useStudio((s) => s.projects),
    [creating, setCreating] = React.useState(false),
    [photo, setPhoto] = React.useState(false),
    [name, setName] = React.useState('My room'),
    [width, setWidth] = React.useState('5.2'),
    [depth, setDepth] = React.useState('4.2'),
    [height, setHeight] = React.useState('2.8'),
    [search, setSearch] = React.useState(''),
    [busy, setBusy] = React.useState(false);
  const create = async () => {
    setBusy(true);
    const id = await useStudio
      .getState()
      .createRoom(name, Number(width), Number(depth), Number(height));
    setBusy(false);
    if (id) {
      setCreating(false);
      router.push(
        photo
          ? { pathname: '/capture', params: { projectId: id } }
          : { pathname: '/room/[id]', params: { id } },
      );
    }
  };
  return (
    <Screen>
      <View style={styles.row}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: palette.brand }}>
          AuraSpace
        </Text>
        <Button
          secondary
          compact
          title="Settings"
          onPress={() => router.push('/settings')}
        />
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 10, letterSpacing: 2, color: palette.brand }}>
          A SPACE TO MAKE YOUR OWN
        </Text>
        <Heading>Good things start with a room.</Heading>
        <Body>
          Photograph, review, and reimagine your space. Your room stays on this
          device, ready to edit offline.
        </Body>
      </View>
      <Panel style={{ backgroundColor: palette.tint, padding: 22 }}>
        <Heading small>Before you move a thing.</Heading>
        <Body>
          See your arrangement from inside, from above, or in a precise floor
          plan.
        </Body>
        <Button
          testID="new-room"
          title="Create a room"
          onPress={() => {
            setPhoto(false);
            setCreating(true);
          }}
        />
        <Button
          secondary
          title="Start with room photos"
          onPress={() => {
            setPhoto(true);
            setCreating(true);
          }}
        />
      </Panel>
      <View style={styles.row}>
        <Heading small>Your rooms</Heading>
        <Button
          compact
          secondary
          title="Import"
          onPress={() => {
            setBusy(true);
            void importPortable()
              .then((id) => {
                if (id) router.push({ pathname: '/room/[id]', params: { id } });
              })
              .catch((error) =>
                useStudio
                  .getState()
                  .notify(
                    error instanceof Error
                      ? error.message
                      : 'This project could not be imported.',
                  ),
              )
              .finally(() => setBusy(false));
          }}
          disabled={busy}
        />
      </View>
      {projects.length > 3 && (
        <Field label="Find a room" value={search} onChangeText={setSearch} />
      )}{' '}
      {projects
        .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
        .map((project) => {
          const b = bounds(project.scene);
          return (
            <Pressable
              key={project.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${project.name}`}
              onPress={() =>
                router.push({
                  pathname: '/room/[id]',
                  params: { id: project.id },
                })
              }
              onLongPress={() =>
                Alert.alert(
                  'Remove this room?',
                  `Delete ${project.name} from this device and queue deletion of its synced copy?`,
                  [
                    { text: 'Keep room', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        void useStudio.getState().remove(project.id);
                      },
                    },
                  ],
                )
              }
            >
              <Panel>
                <Heading small>{project.name}</Heading>
                <Body>
                  {b.width.toFixed(1)} × {b.depth.toFixed(1)} m ·{' '}
                  {project.scene.items.length} physical pieces
                </Body>
                <View style={styles.row}>
                  <Text style={{ fontSize: 11, color: palette.brand }}>
                    {project.sample
                      ? 'Procedural example · editable'
                      : 'Saved on this device · offline ready'}
                  </Text>
                  <Text style={{ color: palette.brand }}>Open →</Text>
                </View>
              </Panel>
            </Pressable>
          );
        })}
      {!projects.length && (
        <Panel>
          <Heading small>Try a little possibility.</Heading>
          <Body>
            Explore a procedural example before photographing your own room.
          </Body>
          <Button
            secondary
            title="Open example room"
            onPress={() => {
              const source = migrateLegacyProject(createSampleProjects()[0]),doc=forkDocument(source,source.name).document;doc.sample=true;
              void useStudio
                .getState()
                .put(doc)
                .then((ok) => {
                  if (ok)
                    router.push({
                      pathname: '/room/[id]',
                      params: { id: doc.id },
                    });
                });
            }}
          />
        </Panel>
      )}
      <Body>
        Export a project package to keep a backup or move your room to another
        device.
      </Body>
      <Sheet
        open={creating}
        title={photo ? 'Start with your room' : 'A blank canvas, all yours'}
        onClose={() => setCreating(false)}
      >
        <Field
          label="Room name"
          value={name}
          maxLength={100}
          onChangeText={setName}
        />
        <View style={styles.row}>
          <Field
            label="Width (m)"
            value={width}
            onChangeText={setWidth}
            keyboardType="decimal-pad"
          />
          <Field
            label="Depth (m)"
            value={depth}
            onChangeText={setDepth}
            keyboardType="decimal-pad"
          />
          <Field
            label="Height (m)"
            value={height}
            onChangeText={setHeight}
            keyboardType="decimal-pad"
          />
        </View>
        <Body>
          These values begin as placeholders until you enter or confirm real
          measurements.
        </Body>
        <Button
          title={photo ? 'Continue to capture' : 'Create room'}
          disabled={busy}
          onPress={() => {
            void create();
          }}
        />
      </Sheet>
    </Screen>
  );
}
