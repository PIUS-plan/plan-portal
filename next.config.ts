import type { NextConfig } from 'next';

const config: NextConfig = {
  // 기획서는 상대경로(./assets/...)로 빌드되므로 /p/<slug>/ 의 끝 슬래시를 지워선 안 된다.
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
};

export default config;
