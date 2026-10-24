import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PiUS 기획서',
  description: 'PiUS 외주 기획서 열람',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
