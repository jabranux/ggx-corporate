import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct, listPagesForProduct } from '@/lib/store';
import { createPageAction } from '../actions';

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const product = getProduct(productId);
  if (!product) notFound();
  const pages = listPagesForProduct(product.id);
  const boundCreatePageAction = createPageAction.bind(null, product.id);

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: '0 20px' }}>
      <p>
        <Link href="/products">&larr; All products</Link>
      </p>
      <h1>{product.name}</h1>
      <p>
        Product ID: <code>{product.id}</code>
      </p>
      <p>
        API Key: <code>{product.apiKey}</code>
      </p>
      <p style={{ fontSize: 13, color: '#666' }}>
        Copy this key into the consuming app&apos;s <code>CMS_API_KEY</code> env
        variable.
      </p>

      <h2>Global content</h2>
      <p style={{ display: 'flex', gap: 16 }}>
        <Link href={`/products/${product.id}/header`}>Edit Header &rarr;</Link>
        <Link href={`/products/${product.id}/footer`}>Edit Footer &rarr;</Link>
      </p>

      <h2>Pages</h2>
      <form action={boundCreatePageAction}>
        <input name="title" placeholder="Page title (e.g. About Us)" required />
        <button type="submit">Create Page</button>
      </form>

      {pages.length === 0 && <p>No pages yet.</p>}
      <ul>
        {pages.map((page) => (
          <li
            key={page.id}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
          >
            <span>
              <strong>{page.title}</strong> &mdash; <code>/{page.slug}</code>
            </span>
            <span style={{ display: 'flex', gap: 12, fontSize: 13 }}>
              <Link href={`/products/${product.id}/pages/${page.id}/edit`}>Edit</Link>
              <Link href={`/products/${product.id}/pages/${page.id}/preview`}>
                Preview
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
