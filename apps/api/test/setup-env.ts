import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(__dirname, '..', '.env');

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) {
      continue;
    }
    const [, key, value] = match;
    if (!(key in process.env)) {
      process.env[key] = value.replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}
