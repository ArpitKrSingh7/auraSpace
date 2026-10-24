import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Morrow Room Studio',
  description: 'Design your space before you move a thing. An intelligent 2D/3D room layout and furniture visualization tool.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Morrow',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#2c2c2c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <div id="app-root" className="h-full w-full overflow-hidden">
          {children}
        </div>
        <div id="portal-root" />
      </body>
    </html>
  );
}
