import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export const SCHEMA = 'plan_portal';
export const BUCKET = 'plans';

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 가 없습니다`);
  return v;
}

/** 로그인한 관리자 세션으로 접근 (RLS 적용) */
export async function sessionClient() {
  const store = await cookies();
  return createServerClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    db: { schema: SCHEMA },
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        // 서버 컴포넌트에서는 쿠키를 못 쓴다. 세션 갱신은 proxy.ts 가 맡는다.
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {}
      },
    },
  });
}

/** 서버 전용 (RLS 우회): 코드 검증, 기획서 파일 응답 */
export function serviceClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    db: { schema: SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 관리자면 세션 클라이언트와 사용자, 아니면 null */
export async function getAdmin() {
  const supabase = await sessionClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: ok } = await supabase.rpc('is_admin');
  return ok ? { supabase, user } : null;
}
