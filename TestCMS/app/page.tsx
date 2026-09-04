import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
      <h1>TestCMS</h1>
      <p>A minimal headless CMS proof of concept.</p>
      <p>
        <Link href="/products">Manage Products &rarr;</Link>
      </p>
    </main>
  );
}
