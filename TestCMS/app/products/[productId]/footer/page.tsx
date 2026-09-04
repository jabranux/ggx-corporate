import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/store';
import FooterEditForm from './FooterEditForm';

export default async function FooterEditPage({
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
      <h1>Edit Footer</h1>
      <p style={{ fontSize: 13, color: '#666' }}>
        This content renders at the bottom of every page in the consuming app.
      </p>
      <FooterEditForm productId={product.id} footer={product.footer} />
    </main>
  );
}
