// Validate deployment inputs without printing secrets or starting services.
const failures = [];
for (const name of ['POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WEB_ORIGIN', 'API_DOMAIN', 'ACME_EMAIL', 'VISION_API_TOKEN'])
  if (!process.env[name]?.trim()) failures.push(`${name} is required`);
for (const name of ['POSTGRES_PASSWORD', 'REDIS_PASSWORD'])
  if (process.env[name] && !/^[A-Za-z0-9_-]+$/.test(process.env[name]))
    failures.push(`${name} must use URL-safe characters because Compose includes it in the internal connection URL`);
for (const name of ['SUPABASE_URL', 'WEB_ORIGIN']) {
  if (!process.env[name]) continue;
  try {
    const url = new URL(process.env[name]);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/')
      failures.push(`${name} must be an HTTPS origin, without credentials or a path`);
  } catch { failures.push(`${name} must be a valid HTTPS origin`); }
}
if (process.env.API_DOMAIN && !/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(process.env.API_DOMAIN))
  failures.push('API_DOMAIN must be a DNS hostname without a scheme, path or port');
if (process.env.ACME_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ACME_EMAIL))
  failures.push('ACME_EMAIL must be a valid contact email');
if (process.env.VISION_API_TOKEN && !/^[A-Za-z0-9_-]{32,}$/.test(process.env.VISION_API_TOKEN))
  failures.push('VISION_API_TOKEN must be at least 32 URL-safe characters');
if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.length < 20)
  failures.push('SUPABASE_SERVICE_ROLE_KEY is incomplete');
for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WEB_ORIGIN', 'API_DOMAIN'])
  if (/YOUR_|\.example(?:\/|$)|example\.com/.test(process.env[name] ?? '')) failures.push(`Replace the ${name} example value`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log('Production input format is valid. DNS, credentials, server capacity and model inference still need live verification.');
