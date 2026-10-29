import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { timedFetch } from '../services/network';
import { clearSession, readSession, saveSession } from '../services/session';
import { useStudio } from '../state/studio';
import { Body, Button, Heading, Panel } from './ui';
WebBrowser.maybeCompleteAuthSession();
export function AccountConnection() {
  const issuer = Constants.expoConfig?.extra?.oidcIssuer as string | undefined,
    clientId = Constants.expoConfig?.extra?.oidcClientId as string | undefined;
  if (!issuer || !clientId)
    return (
      <Panel>
        <Heading small>Account connection</Heading>
        <Body>
          This build uses a private guest workspace. Configure the documented
          OpenID Connect issuer and client ID to enable account sign-in.
        </Body>
        <Button
          secondary
          title="Disconnect server session"
          onPress={() => {
            void clearSession()
              .then(() =>
                useStudio
                  .getState()
                  .notify(
                    'Session disconnected. Local room files remain on this device.',
                  ),
              )
              .catch(() =>
                useStudio.getState().notify('Please retry disconnecting.'),
              );
          }}
        />
      </Panel>
    );
  return <OidcConnection issuer={issuer} clientId={clientId} />;
}
function OidcConnection({
  issuer,
  clientId,
}: {
  issuer: string;
  clientId: string;
}) {
  const [discovery, setDiscovery] =
      React.useState<AuthSession.DiscoveryDocument | null>(null),
    [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    void AuthSession.fetchDiscoveryAsync(issuer)
      .then((value) => {
        if (active) setDiscovery(value);
      })
      .catch(() => {
        if (active)
          useStudio
            .getState()
            .notify(
              'The sign-in provider is unavailable. Continue offline or retry later.',
            );
      });
    return () => {
      active = false;
    };
  }, [issuer]);
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'auraspace',
    path: 'auth',
  });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: clientId ?? '',
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: ['openid', 'profile', 'offline_access'],
      usePKCE: true,
    },
    discovery,
  );
  React.useEffect(() => {
    if (
      response?.type !== 'success' ||
      !discovery ||
      !request ||
      !issuer ||
      !clientId
    )
      return;
    setBusy(true);
    void (async () => {
      const previous = await readSession(),
        tokens = await AuthSession.exchangeCodeAsync(
          {
            clientId,
            code: response.params.code,
            redirectUri,
            extraParams: { code_verifier: request.codeVerifier ?? '' },
          },
          discovery,
        );
      if (previous?.token.startsWith('guest_')) {
        const endpoint = useStudio.getState().endpoint,
          result = await timedFetch(`${endpoint}/v1/sessions/link`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ guestToken: previous.token }),
          });
        const body = await result.json();
        if (!body.ok)
          throw new Error(
            body.error?.message ??
              'The guest workspace could not be linked. Your local rooms are safe.',
          );
      }
      await saveSession({
        token: tokens.accessToken,
        expiresAt: new Date(
          Date.now() + (tokens.expiresIn ?? 3600) * 1000,
        ).toISOString(),
        refreshToken: tokens.refreshToken,
        issuer,
        clientId,
      });
      useStudio
        .getState()
        .notify('Signed in. Your offline room drafts are preserved.');
    })()
      .catch((error) =>
        useStudio
          .getState()
          .notify(
            error instanceof Error
              ? error.message
              : 'Sign-in could not finish. Continue offline or retry.',
          ),
      )
      .finally(() => setBusy(false));
  }, [response]);
  return (
    <Panel>
      <Heading small>Account connection</Heading>
      <Body>
        {issuer && clientId
          ? 'Sign in with the configured identity provider. This links the current guest workspace to your account.'
          : 'This build supports a local guest workspace. Configure the documented OpenID Connect issuer and client ID to enable account sync.'}
      </Body>
      {issuer && clientId && (
        <Button
          title="Sign in & link workspace"
          disabled={
            !request || !discovery || busy || !useStudio.getState().endpoint
          }
          onPress={() => {
            void promptAsync().catch(() =>
              useStudio
                .getState()
                .notify(
                  'Sign-in could not open. Your local room remains available.',
                ),
            );
          }}
        />
      )}
      <Button
        secondary
        title="Disconnect server session"
        onPress={() => {
          void clearSession()
            .then(() =>
              useStudio
                .getState()
                .notify(
                  'Session disconnected. Local room files remain on this device.',
                ),
            )
            .catch(() =>
              useStudio
                .getState()
                .notify('The session could not be cleared. Please retry.'),
            );
        }}
      />
    </Panel>
  );
}
