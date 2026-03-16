import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mattonflex Visualizer',
  description:
    'Visualizza i pannelli decorativi Mattonflex sulla tua parete prima di acquistare.',
  keywords: ['mattonflex', 'pannelli', 'mattoni', 'rivestimento', 'visualizzatore', 'AR'],
  authors: [{ name: 'Btrees' }],
  openGraph: {
    title: 'Mattonflex Visualizer',
    description: 'Prova i pannelli Mattonflex sulla tua parete in AR',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0a0a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={inter.variable}>
      <body className="h-full overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)] antialiased">
        {children}
      </body>
    </html>
  );
}
