import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from './ui';

export const metadata: Metadata = {
  title: 'LendingGenie KB — Operations Console',
  description: 'Internal operations console for LendingGenie knowledge base management.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
