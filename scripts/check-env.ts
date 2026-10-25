import { configuration } from '../packages/backend/src/config';

try {
  const config = configuration();
  const placeholders = Object.entries(config)
    .filter(([, value]) => typeof value === 'string' && /YOUR_|your-provider\.example/.test(value))
    .map(([name]) => name);
  if (placeholders.length) {
    throw new Error(`Replace the placeholders in .env: ${placeholders.join(', ')}`);
  }
  console.log('Environment format is valid. This does not test service connectivity.');
} catch (error) {
  // Configuration errors contain variable names, never credential values.
  console.error(error instanceof Error ? error.message : 'Check the root .env configuration.');
  process.exitCode = 1;
}
