import Link from 'next/link';
import { listProducts } from '@/lib/store';
import { createProductAction } from './actions';

export default function ProductsPage() {
  const products = listProducts();

  return (
    <main style={{ maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
      <p>
        <Link href="/">&larr; TestCMS</Link>
      </p>
      <h1>Products</h1>
      <p>
        A Product represents a separate app that will consume TestCMS content
        through the API.
      </p>

      <form action={createProductAction}>
        <input name="name" placeholder="Product name (e.g. Demo App)" required />
        <button type="submit">Create Product</button>
      </form>

      <h2>Existing products</h2>
      {products.length === 0 && <p>No products yet.</p>}
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            <Link href={`/products/${p.id}`}>{p.name}</Link> &mdash;{' '}
            <code>{p.id}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
