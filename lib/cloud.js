import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const mem = globalThis.__storemapMem || new Map();
globalThis.__storemapMem = mem;

const KEY_PREFIX = 'storemap:';

function filePath(slug) {
  return path.join(os.tmpdir(), `spatialytics-storemap-${slug}.json`);
}

/** Upstash Redis REST or Vercel KV REST */
function redisConfig() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    '';
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    '';
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

export function storageMode() {
  return redisConfig() ? 'redis' : 'ephemeral';
}

async function redisCommand(cfg, ...args) {
  const res = await fetch(`${cfg.url}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Redis error ${res.status}: ${t}`);
  }
  const data = await res.json();
  // Upstash returns { result: ... }
  return data.result !== undefined ? data.result : data;
}

export function slugify(name) {
  return (
    String(name || 'store')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'store'
  );
}

export async function savePublished(slug, payload) {
  const existing = await loadPublished(slug);
  const record = {
    ...payload,
    slug,
    publishedAt: existing?.publishedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const cfg = redisConfig();
  if (cfg) {
    await redisCommand(cfg, 'SET', `${KEY_PREFIX}${slug}`, JSON.stringify(record));
    // keep a simple index of slugs (optional)
    try {
      await redisCommand(cfg, 'SADD', `${KEY_PREFIX}index`, slug);
    } catch {
      /* ignore */
    }
    mem.set(slug, record);
    return { ...record, storage: 'redis' };
  }

  // Ephemeral fallback (demo only)
  mem.set(slug, record);
  try {
    await fs.writeFile(filePath(slug), JSON.stringify(record), 'utf8');
  } catch (e) {
    console.warn('tmp write failed', e.message);
  }
  return { ...record, storage: 'ephemeral' };
}

export async function loadPublished(slug) {
  const cfg = redisConfig();
  if (cfg) {
    try {
      const raw = await redisCommand(cfg, 'GET', `${KEY_PREFIX}${slug}`);
      if (raw) {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        mem.set(slug, data);
        return data;
      }
    } catch (e) {
      console.warn('redis get failed', e.message);
    }
  }

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
