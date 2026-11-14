import './globals.css';

export const metadata = {
  title: 'Backrooms Level 0',
  description: '2D top-down multiplayer Backrooms horror prototype',
};

// 휴대폰에서 두 손가락 확대/더블탭 확대로 화면이 움직이지 않게
export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover' };

export default function RootLayout({ children }) {
  return (
    // lang 은 브라우저에서 shared/i18n.js 가 고른 언어로 바뀐다 (그래서 hydration 경고를 끈다)
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=VT323&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
