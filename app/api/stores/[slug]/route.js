import { NextResponse } from 'next/server';
import { loadPublished, savePublished, slugify, storageMode } from '@/lib/cloud';

export async function GET(_req, { params }) {
  const slug = params.slug;
  const data = await loadPublished(slug);
  if (!data) {
    return NextResponse.json(
      {
        error:
          storageMode() === 'redis'
            ? 'Map not found for this slug.'
            : 'Map not found. Ephemeral storage may have cleared — re-publish from Store Map, or add Redis for durable links.',
        storage: storageMode(),
      },
      { status: 404 }
    );
  }
  return NextResponse.json({ ...data, storage: storageMode() });
}

export async function PUT(request, { params }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const slug = params.slug || slugify(body?.store?.name);
  if (!body?.store?.name) {
    return NextResponse.json({ error: 'store required' }, { status: 400 });
  }
  const record = await savePublished(slug, {
    store: body.store,
    aisles: body.aisles || [],
    products: body.products || [],
  });
  return NextResponse.json({
    ok: true,
    slug: record.slug,
    publishedAt: record.publishedAt,
    storage: record.storage || storageMode(),
    durable: (record.storage || storageMode()) === 'redis',
    url: `/s/${record.slug}`,
  });
}
