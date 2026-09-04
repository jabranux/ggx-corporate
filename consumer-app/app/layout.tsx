import type { ReactNode } from 'react';
import Link from 'next/link';
import { getSite } from '@/lib/cms';
import './globals.css';

export const metadata = {
  title: 'Demo App',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const site = await getSite();

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, Segoe UI, Roboto, sans-serif' }}>
        <header
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #ddd',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link href="/" style={{ fontWeight: 700, color: '#1a1a1a', textDecoration: 'none' }}>
            {site.header.siteName}
          </Link>
          <nav style={{ display: 'flex', gap: 20 }}>
            {site.header.navigation.map((item, i) => (
              <Link key={i} href={item.url} style={{ color: '#1a1a1a' }}>
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main style={{ minHeight: '60vh', padding: '40px 24px' }}>{children}</main>
        <footer
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #ddd',
            color: '#555',
          }}
          dangerouslySetInnerHTML={{ __html: site.footer.content || '' }}
        />
      </body>
    </html>
  );
}
