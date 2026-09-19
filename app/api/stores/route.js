import { NextResponse } from 'next/server';
import { savePublished, slugify } from '@/lib/cloud';

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
  const base = slugify(body.slug || body.store.name);
  const slug = body.slug ? slugify(body.slug) : `${base}-${Date.now().toString(36).slice(-4)}`;
  const record = await savePublished(slug, {
    store: body.store,
    aisles: body.aisles || [],
    products: body.products || [],
  });
  return NextResponse.json({
    ok: true,
    slug: record.slug,
    publishedAt: record.publishedAt,
    url: `/s/${record.slug}`,
  });
}
