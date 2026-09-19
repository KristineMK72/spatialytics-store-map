import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const mem = globalThis.__storemapMem || new Map();
globalThis.__storemapMem = mem;

function filePath(slug) {
  return path.join(os.tmpdir(), `spatialytics-storemap-${slug}.json`);
}

export function slugify(name) {
  return String(name || 'store')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'store';
}

export async function savePublished(slug, payload) {
  const record = {
    ...payload,
    slug,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  mem.set(slug, record);
  try {
    await fs.writeFile(filePath(slug), JSON.stringify(record), 'utf8');
  } catch (e) {
    console.warn('tmp write failed', e.message);
  }
  return record;
}

export async function loadPublished(slug) {
  if (mem.has(slug)) return mem.get(slug);
  try {
    const raw = await fs.readFile(filePath(slug), 'utf8');
    const data = JSON.parse(raw);
    mem.set(slug, data);
    return data;
  } catch {
    return null;
  }
}
