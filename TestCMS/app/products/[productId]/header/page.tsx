import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/store';
import HeaderEditForm from './HeaderEditForm';

export default async function HeaderEditPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const product = getProduct(productId);
  if (!product) notFound();

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: '0 20px' }}>
      <p>
        <Link href={`/products/${product.id}`}>&larr; Back to {product.name}</Link>
      </p>
      <h1>Edit Header</h1>
      <p style={{ fontSize: 13, color: '#666' }}>
        This site name and navigation render at the top of every page in the
        consuming app.
      </p>
      <HeaderEditForm productId={product.id} header={product.header} />
    </main>
  );
}
