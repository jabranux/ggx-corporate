import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct, getPageById } from '@/lib/store';

export default async function PagePreview({
  params,
}: {
  params: Promise<{ productId: string; pageId: string }>;
}) {
  const { productId, pageId } = await params;
  const product = getProduct(productId);
  const page = product ? getPageById(product.id, pageId) : undefined;
  if (!product || !page) notFound();

  return (
    <main style={{ maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
      <p>
        <Link href={`/products/${product.id}`}>&larr; Back to {product.name}</Link>
      </p>
      <p style={{ fontSize: 13, color: '#666' }}>
        Preview &mdash; slug: <code>/{page.slug}</code>
      </p>
      <h1>{page.title}</h1>
    </main>
  );
}
