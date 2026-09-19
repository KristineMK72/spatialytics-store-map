import { NextResponse } from 'next/server';
import { storageMode } from '@/lib/cloud';

export async function GET() {
  const mode = storageMode();
  return NextResponse.json({
    storage: mode,
    durable: mode === 'redis',
    message:
      mode === 'redis'
        ? 'Published maps persist in Redis/KV.'
        : 'No Redis/KV env vars — published maps are ephemeral (re-publish if link 404s). Add UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN on Vercel for durable links.',
  });
}
