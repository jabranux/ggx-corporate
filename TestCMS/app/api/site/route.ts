import { NextRequest, NextResponse } from 'next/server';
import { authenticateProduct } from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
  const auth = authenticateProduct(req);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({
    header: auth.header,
    footer: auth.footer,
  });
}
