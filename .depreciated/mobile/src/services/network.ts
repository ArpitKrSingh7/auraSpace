/** Portable timeout handling for Hermes versions without AbortSignal.timeout. */
export async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30000,
) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
