import type { ApiResult } from '@auraspace/contracts';
import { useStudio } from '../state/studio';
import { timedFetch } from './network';
import { accessToken } from './session';
export class ApiFailure extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable = false,
    public status = 0,
  ) {
    super(message);
  }
}
export async function sessionToken(endpoint = useStudio.getState().endpoint) {
  try {
    return await accessToken(endpoint);
  } catch (error) {
    throw new ApiFailure(
      error instanceof Error ? error.message : 'Connect your workspace again.',
      'authentication',
    );
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  timeout = 30000,
  serverEndpoint?: string,
): Promise<T> {
  try {
    const endpoint = serverEndpoint ?? useStudio.getState().endpoint,
      token = await sessionToken(endpoint);
    const response = await timedFetch(
      `${endpoint}${path}`,
      {
        ...options,
        headers: {
          ...(options.body && !((options.body as any) instanceof Uint8Array)
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...options.headers,
          Authorization: `Bearer ${token}`,
        },
      },
      timeout,
    );
    const result = (await response.json()) as ApiResult<T>;
    if (!result.ok)
      throw new ApiFailure(
        result.error?.message ?? 'The server could not finish this request.',
        result.error?.code ?? 'server-error',
        result.error?.retryable ?? false,
        response.status,
      );
    if (!response.ok)
      throw new ApiFailure(
        'The server could not finish this request.',
        'server-error',
        true,
        response.status,
      );
    return result.data;
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure(
      'Could not reach the server. Your room is saved locally; retry when connected.',
      'network',
      true,
    );
  }
}
export async function downloadArtifact(id: string) {
  const endpoint = useStudio.getState().endpoint,
    token = await sessionToken(endpoint);
  const response = await timedFetch(
    `${endpoint}/v1/artifacts/${id}/content`,
    { headers: { Authorization: `Bearer ${token}` } },
    30000,
  );
  if (!response.ok)
    throw new ApiFailure(
      'This image could not be downloaded. Retry when connected.',
      'media-unavailable',
      true,
      response.status,
    );
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType:
      response.headers.get('content-type')?.split(';')[0] ?? 'image/png',
  };
}

export const permanentOperationError = (error: unknown) =>
  error instanceof ApiFailure &&
  ([
    'revision-conflict',
    'mask-changed',
    'capture-removed',
    'project-removed',
    'server-changed',
  ].includes(error.code) ||
    (error.status >= 400 && error.status < 500 && !error.retryable));
