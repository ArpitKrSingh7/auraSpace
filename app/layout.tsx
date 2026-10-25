import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastContainer } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: 'AuraSpace — Intelligent Room Layout & Furniture Visualization',
  description:
    'Design your space before you move a thing. An intelligent 2D/3D room layout and furniture visualization tool.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AuraSpace',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2c2c2c',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <div id="app-root" className="min-h-screen w-full">
          {children}
        </div>
        <div id="portal-root" />
        <ToastContainer />
      </body>
    </html>
  );
}
