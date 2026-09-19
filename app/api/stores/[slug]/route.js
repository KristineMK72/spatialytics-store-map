import { NextResponse } from 'next/server';
import { loadPublished, savePublished, slugify } from '@/lib/cloud';

export async function GET(_req, { params }) {
  const slug = params.slug;
  const data = await loadPublished(slug);
  if (!data) {
    return NextResponse.json(
      { error: 'Map not found. It may have expired on this server — re-publish from Store Map.' },
      { status: 404 }
    );
  }
  return NextResponse.json(data);
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
    url: `/s/${record.slug}`,
  });
}

export async function POST(request) {
  // allow POST to /api/stores/[slug] same as PUT
  return PUT(request, { params: { slug: (await request.json().catch(() => ({}))).slug } });
}
