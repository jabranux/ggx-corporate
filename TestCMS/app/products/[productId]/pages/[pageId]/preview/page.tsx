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
    <main style={{ maxWidth: 720, margin: '40px auto', padding: '0 20px' }}>
      <p>
        <Link href={`/products/${product.id}`}>&larr; Back to {product.name}</Link>
      </p>
      <p style={{ fontSize: 13, color: '#666' }}>
        Preview &mdash; approximate composition as it will appear in the
        consuming app.
      </p>

      <div style={{ border: '1px solid #ddd', borderRadius: 10, overflow: 'hidden' }}>
        <header
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #ddd',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#fff',
          }}
        >
          <strong>{product.header.siteName}</strong>
          <nav style={{ display: 'flex', gap: 16 }}>
            {product.header.navigation.map((item, i) => (
              <span key={i} style={{ fontSize: 14 }}>
                {item.label}
              </span>
            ))}
          </nav>
        </header>

        <div style={{ padding: '32px 24px', background: '#fff' }}>
          <h1 style={{ marginTop: 0 }}>{page.title}</h1>
          <div
            className="cms-rendered"
            dangerouslySetInnerHTML={{ __html: page.content || '<p><em>No content yet.</em></p>' }}
          />
        </div>

        <footer
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #ddd',
            background: '#fafafa',
            color: '#555',
          }}
        >
          <div
            className="cms-rendered"
            dangerouslySetInnerHTML={{ __html: product.footer.content || '<p>&nbsp;</p>' }}
          />
        </footer>
      </div>
    </main>
  );
}
