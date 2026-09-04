'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createProduct, createPage } from '@/lib/store';

export async function createProductAction(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  if (!name) return;
  const product = createProduct(name);
  revalidatePath('/products');
  redirect(`/products/${product.id}`);
}

export async function createPageAction(productId: string, formData: FormData) {
  const title = String(formData.get('title') || '').trim();
  if (!title) return;
  createPage(productId, title);
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}
