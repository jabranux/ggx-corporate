'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  createProduct,
  createPage,
  updatePage,
  updateHeader,
  updateFooter,
  type Header,
  type Footer,
} from '@/lib/store';

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
  const page = createPage(productId, title);
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}/pages/${page.id}/edit`);
}

export async function updatePageAction(
  productId: string,
  pageId: string,
  data: { title: string; content: string }
) {
  const title = data.title.trim();
  if (!title) return;
  updatePage(productId, pageId, { title, content: data.content });
  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/pages/${pageId}/edit`);
  revalidatePath(`/products/${productId}/pages/${pageId}/preview`);
}

export async function updateHeaderAction(productId: string, header: Header) {
  updateHeader(productId, header);
  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/header`);
}

export async function updateFooterAction(productId: string, footer: Footer) {
  updateFooter(productId, footer);
  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/footer`);
}
