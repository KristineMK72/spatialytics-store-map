import { NextResponse } from 'next/server';
import { savePublished, slugify, storageMode } from '@/lib/cloud';

/** Publish a store map snapshot → returns public slug */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body?.store?.name) {
    return NextResponse.json({ error: 'store required' }, { status: 400 });
  }

  // Stable slug if re-publishing same store name + optional slug
  const base = slugify(body.slug || body.store.publishSlug || body.store.name);
  const slug = body.reuseSlug || body.store.publishSlug || base;

  const record = await savePublished(slug, {
    store: body.store,
    aisles: body.aisles || [],
    products: body.products || [],
  });

  return NextResponse.json({
    ok: true,
    slug: record.slug,
    publishedAt: record.publishedAt,
    updatedAt: record.updatedAt,
    storage: record.storage || storageMode(),
    durable: (record.storage || storageMode()) === 'redis',
    url: `/s/${record.slug}`,
  });
}
