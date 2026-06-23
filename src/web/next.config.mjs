import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  // Pin the workspace root to the project (avoids the multi-lockfile warning
  // from a stray lockfile in the home directory).
  outputFileTracingRoot: path.join(dir, '..', '..'),
};
