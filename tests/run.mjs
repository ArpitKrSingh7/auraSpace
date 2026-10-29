// Import cases in this process: Node 25 + module hooks otherwise reports only files.
import { readdir } from 'node:fs/promises';
for (const file of (await readdir(new URL('.', import.meta.url)))
  .filter((name) => name.endsWith('.test.mjs')).sort()) {
  await import(new URL(file, import.meta.url));
}
