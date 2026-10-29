import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { AccountConnection } from '../src/components/AccountConnection';
import {
  Body,
  Button,
  Field,
  Heading,
  Panel,
  Screen,
  styles,
} from '../src/components/ui';
import { request } from '../src/services/api';
import { useStudio } from '../src/state/studio';
export default function Settings() {
  const router = useRouter(),
    endpoint = useStudio((s) => s.endpoint),
    [url, setUrl] = React.useState(endpoint),
    [busy, setBusy] = React.useState(false);
  return (
    <Screen>
      <View style={styles.row}>
        <Heading>Workspace</Heading>
        <Button compact secondary title="Back" onPress={() => router.back()} />
      </View>
      <Panel>
        <Heading small>Room analysis server</Heading>
        <Body>
          Leave this empty for offline planning. To analyze photos on your
          Android phone, enter your laptop’s reachable LAN URL, such as
          http://192.168.1.20:4000. Localhost on the phone refers to the phone.
        </Body>
        <Field
          label="Server URL"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Button
          title="Save connection"
          disabled={busy}
          onPress={() => {
            void useStudio
              .getState()
              .setEndpoint(url)
              .then((ok) => {
                if (ok)
                  useStudio
                    .getState()
                    .notify(
                      'Connection setting saved. Your existing room files stay on this device.',
                    );
              });
          }}
        />
        <Button
          secondary
          title="Test connection"
          disabled={!endpoint || busy}
          onPress={() => {
            setBusy(true);
            void request('/v1/projects')
              .then(() =>
                useStudio
                  .getState()
                  .notify(
                    'Connected. Photo analysis and project sync are available.',
                  ),
              )
              .catch((error) =>
                useStudio
                  .getState()
                  .notify(
                    error instanceof Error
                      ? error.message
                      : 'Could not connect.',
                  ),
              )
              .finally(() => setBusy(false));
          }}
        />
      </Panel>
      <AccountConnection />
      <Panel>
        <Heading small>Private by default</Heading>
        <Body>
          Originals and drafts live in app document storage. Photos upload only
          when you start a server operation or explicitly sync them. Guest
          credentials use Android’s secure store. The server checks ownership
          for projects, jobs, and media.
        </Body>
      </Panel>
      <Panel>
        <Heading small>Device capture</Heading>
        <Body>
          Ordinary photos work without depth hardware. Native ARCore scanning is
          shown only after a supported capture adapter is installed and
          validated; this build does not label a regular photograph as a metric
          scan.
        </Body>
      </Panel>
      <Button
        secondary
        title="Retry pending local saves"
        onPress={() => {
          void useStudio
            .getState()
            .flush()
            .then(() =>
              useStudio.getState().notify('Local saves are up to date.'),
            )
            .catch(() =>
              useStudio
                .getState()
                .notify(
                  'Storage is still unavailable. Export a backup or free some space.',
                ),
            );
        }}
      />
    </Screen>
  );
}
