import type { Metadata } from 'next';
import { Inter, Sora } from 'next/font/google';
import './globals.css';
import { AppLayout } from '@/components/layout/AppLayout';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const sora = Sora({ subsets: ['latin'], variable: '--font-sora', weight: ['400', '600', '700', '800'] });

export const metadata: Metadata = {
  title: 'Print Shop — Orders & Invoicing',
  description: 'Order and invoicing management for print shops, screen printing, and embroidery businesses.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sora.variable} h-full`}>
      <body className="min-h-full" style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
