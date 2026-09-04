import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'TestCMS',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #ddd',
            fontWeight: 700,
            background: '#fff',
          }}
        >
          TestCMS
        </header>
        {children}
      </body>
    </html>
  );
}
