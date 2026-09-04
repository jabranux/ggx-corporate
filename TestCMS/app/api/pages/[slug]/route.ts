import { NextRequest, NextResponse } from 'next/server';
import { getProductByApiKey, getPageBySlug } from '@/lib/store';

function extractApiKey(req: NextRequest): string {
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return req.headers.get('x-api-key') || '';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
  }

  const product = getProductByApiKey(apiKey);
  if (!product) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const page = getPageBySlug(product.id, slug);
  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  return NextResponse.json({ title: page.title, slug: page.slug });
}
