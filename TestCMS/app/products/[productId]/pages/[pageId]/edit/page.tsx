import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct, getPageById } from '@/lib/store';
import PageEditForm from './PageEditForm';

export default async function PageEdit({
  params,
}: {
  params: Promise<{ productId: string; pageId: string }>;
}) {
  const { productId, pageId } = await params;
  const product = getProduct(productId);
  const page = product ? getPageById(product.id, pageId) : undefined;
  if (!product || !page) notFound();

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: '0 20px' }}>
      <p>
        <Link href={`/products/${product.id}`}>&larr; Back to {product.name}</Link>
      </p>
      <h1>Edit Page</h1>
      <PageEditForm productId={product.id} page={page} />
    </main>
  );
}
