import type { NextConfig } from 'next';

const config: NextConfig = {
  // 기획서는 상대경로(./assets/...)로 빌드되므로 /p/<slug>/ 의 끝 슬래시를 지워선 안 된다.
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  // 기획서 zip 업로드 (Vercel 함수 요청 한도 4.5MB 안)
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
};

export default config;
