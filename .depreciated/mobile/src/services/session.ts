import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { useStudio } from '../state/studio';
import { timedFetch } from './network';
export interface Session {
  token: string;
  expiresAt: string;
  refreshToken?: string;
  issuer?: string;
  clientId?: string;
}
export const sessionKey = async (endpoint: string) =>
  `session-${await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, endpoint)}`;
export async function readSession(endpoint = useStudio.getState().endpoint) {
  if (!endpoint) return null;
  const raw = await SecureStore.getItemAsync(await sessionKey(endpoint));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return {
      token: raw,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
  }
}
export async function saveSession(
  session: Session,
  endpoint = useStudio.getState().endpoint,
) {
  await SecureStore.setItemAsync(
    await sessionKey(endpoint),
    JSON.stringify(session),
  );
}
export async function clearSession() {
  const endpoint = useStudio.getState().endpoint;
  if (endpoint) await SecureStore.deleteItemAsync(await sessionKey(endpoint));
}
const pending = new Map<string, Promise<string>>();
export async function accessToken(endpoint = useStudio.getState().endpoint) {
  if (pending.has(endpoint)) return pending.get(endpoint)!;
  const task = (async () => {
    if (!endpoint)
      throw new Error(
        'Connect a room server when you are ready for analysis. Manual planning works offline.',
      );
    const saved = await readSession(endpoint);
    if (saved && Date.parse(saved.expiresAt) > Date.now() + 60000)
      return saved.token;
    if (saved?.refreshToken && saved.issuer && saved.clientId) {
      const discovery = await AuthSession.fetchDiscoveryAsync(saved.issuer),
        tokens = await AuthSession.refreshAsync(
          { clientId: saved.clientId, refreshToken: saved.refreshToken },
          discovery,
        );
      const next = {
        ...saved,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? saved.refreshToken,
        expiresAt: new Date(
          Date.now() + (tokens.expiresIn ?? 3600) * 1000,
        ).toISOString(),
      };
      await saveSession(next, endpoint);
      return next.token;
    }
    if (saved)
      throw new Error(
        'Your workspace session expired. Sign in again; your offline rooms are safe.',
      );
    const response = await timedFetch(
      `${endpoint}/v1/sessions/guest`,
      { method: 'POST' },
      15000,
    );
    const body = await response.json();
    if (!response.ok || !body.ok)
      throw new Error(
        body.error?.message ??
          'This server requires sign-in. You can continue planning offline.',
      );
    await saveSession(
      { token: body.data.token, expiresAt: body.data.expiresAt },
      endpoint,
    );
    return body.data.token as string;
  })();
  pending.set(endpoint, task);
  try {
    return await task;
  } finally {
    pending.delete(endpoint);
  }
}
