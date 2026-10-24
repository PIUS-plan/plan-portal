import 'server-only';
import { headers } from 'next/headers';

/** 기획자용 사용 매뉴얼 (Claude Docs) */
export const MANUAL_URL = process.env.MANUAL_URL || 'https://claude.ai/artifact/2e4gEG2Tct8qEoTXCHUEEa';

/** 공유 링크에 쓰는 포털 주소 (SITE_URL, 없으면 요청 도메인) */
export async function siteOrigin() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
}

/** 고객에게 주는 기본 주소 (코드 없음) */
export const shareUrl = (origin: string, slug: string) => `${origin}/p/${slug}/`;
