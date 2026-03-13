import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nestlyx',
  description: 'Open source meeting platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
