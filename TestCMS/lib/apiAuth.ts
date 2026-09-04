import { NextRequest } from 'next/server';
import { getProductByApiKey, type Product } from '@/lib/store';

export function extractApiKey(req: NextRequest): string {
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return req.headers.get('x-api-key') || '';
}

export function authenticateProduct(req: NextRequest): Product | { error: string; status: number } {
  const apiKey = extractApiKey(req);
  if (!apiKey) return { error: 'Missing API key', status: 401 };

  const product = getProductByApiKey(apiKey);
  if (!product) return { error: 'Invalid API key', status: 401 };

  return product;
}
