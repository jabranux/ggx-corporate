import { NextRequest, NextResponse } from 'next/server';
import { authenticateProduct } from '@/lib/apiAuth';
import { getPageBySlug } from '@/lib/store';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const auth = authenticateProduct(req);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const page = getPageBySlug(auth.id, slug);
  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  return NextResponse.json({
    title: page.title,
    slug: page.slug,
    content: page.content,
  });
}
