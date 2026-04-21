import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Toaster } from 'react-hot-toast';
import Providers from '@/components/Providers';
import './globals.css';

const geistSans = localFont({
  src: '../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = localFont({
  src: '../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'AdInsight — Meta Ads Intelligence',
    template: '%s | AdInsight',
  },
  description:
    'AI-powered Meta Ads analytics. Detect anomalies, optimize campaigns, and grow ROAS with intelligent insights.',
  keywords: ['meta ads', 'facebook ads', 'advertising analytics', 'roas optimization', 'ad intelligence'],
  robots: 'noindex', // SaaS app — no public indexing
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans bg-surface-1000 text-white antialiased`}
      >
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#1e2640',
                color: '#e4e8f3',
                border: '1px solid rgba(91,99,248,0.2)',
                borderRadius: '10px',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#4ade80', secondary: '#1e2640' } },
              error: { iconTheme: { primary: '#f87171', secondary: '#1e2640' } },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
