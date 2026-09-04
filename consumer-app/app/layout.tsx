import type { ReactNode } from 'react';

export const metadata = {
  title: 'Demo App',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, Segoe UI, Roboto, sans-serif' }}>
        <header
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #ddd',
            fontWeight: 700,
          }}
        >
          Demo App
        </header>
        <main style={{ minHeight: '60vh', padding: '40px 24px' }}>{children}</main>
        <footer
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #ddd',
            textAlign: 'right',
            color: '#888',
          }}
        >
          Footer
        </footer>
      </body>
    </html>
  );
}
