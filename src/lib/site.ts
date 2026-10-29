export const SITE_NAME = 'AuraSpace';
export const SITE_TITLE = 'AuraSpace — 2D & 3D Room Planner';
export const SITE_DESCRIPTION =
  'Plan your room in 2D and 3D. Upload photos, review AI-assisted room estimates, and arrange furniture before moving a thing.';

// Use the canonical production domain on preview deployments too. An explicit
// public site URL takes precedence when a custom domain is connected.
function resolveSiteUrl(): URL {
  for (const value of [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ]) {
    if (!value?.trim()) continue;
    try {
      const candidate = value.trim();
      const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
      if (url.protocol === 'https:' || url.protocol === 'http:') return new URL(url.origin);
    } catch { /* Try the deployment-provided hostname next. */ }
  }
  return new URL('http://localhost:3000');
}

export const siteUrl = resolveSiteUrl();
