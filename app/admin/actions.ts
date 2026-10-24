'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAdmin, sessionClient } from '@/lib/supabase/server';
import { generateCode, hashCode, normalizeCode } from '@/lib/viewer';
import { GitHubError, IGNORED, ORG, commitFiles, createPlanRepo, repoExists } from '@/lib/github';
import { PlanZipError, parsePlanZip, toSlug } from '@/lib/zip';

async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect('/admin/login');
  return admin;
}

export async function signIn(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const supabase = await sessionClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
  });
  if (error) return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' };

  const { data: ok } = await supabase.rpc('is_admin');
  if (!ok) {
    await supabase.auth.signOut();
    return { error: '관리자로 등록되지 않은 계정입니다.' };
  }
  redirect('/admin');
}

export async function signOut() {
  const supabase = await sessionClient();
  await supabase.auth.signOut();
  redirect('/admin/login');
}

export async function updatePlan(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(form.get('id'));
  const status = String(form.get('status'));
  if (!['draft', 'active', 'archived'].includes(status)) throw new Error('잘못된 상태');

  const { error } = await supabase
    .from('plans')
    .update({
      title: String(form.get('title') ?? '').trim(),
      client_name: String(form.get('client_name') ?? '').trim() || null,
      status,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin', 'layout');
}

export async function setCurrentVersion(form: FormData) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from('plans')
    .update({ current_version_id: String(form.get('version_id')) })
    .eq('id', String(form.get('plan_id')));
  if (error) throw new Error(error.message);
  revalidatePath('/admin', 'layout');
}

export type NewCode = { code?: string; link?: string; error?: string };

export async function createCode(_prev: NewCode, form: FormData): Promise<NewCode> {
  const { supabase, user } = await requireAdmin();
  const planId = String(form.get('plan_id'));
  const label = String(form.get('label') ?? '').trim() || null;
  const days = Number(form.get('days') || 0);
  const expires_at = days > 0 ? new Date(Date.now() + days * 86400_000).toISOString() : null;

  const code = generateCode();
  const { error } = await supabase.from('access_codes').insert({
    plan_id: planId,
    code_hash: hashCode(code),
    code_hint: normalizeCode(code).slice(-4),
    label,
    expires_at,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  const h = await headers();
  const origin = process.env.SITE_URL || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  revalidatePath(`/admin/plans/${planId}`);
  return { code, link: `${origin}/c/${code}` };
}

export async function revokeCode(form: FormData) {
  const { supabase } = await requireAdmin();
  const planId = String(form.get('plan_id'));
  const { error } = await supabase
    .from('access_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', String(form.get('code_id')));
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/plans/${planId}`);
}

export type UploadState = { error?: string };

const MAX_ZIP = 4 * 1024 * 1024;

export async function uploadPlan(_prev: UploadState, form: FormData): Promise<UploadState> {
  const { supabase, user } = await requireAdmin();

  const file = form.get('zip');
  if (!(file instanceof File) || file.size === 0) return { error: 'zip 파일을 선택해 주세요.' };
  if (file.size > MAX_ZIP) return { error: 'zip 파일은 4MB 이하여야 합니다. node_modules·dist 폴더가 들어 있지 않은지 확인해 주세요.' };

  let parsed;
  try {
    parsed = parsePlanZip(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof PlanZipError) return { error: e.message };
    throw e;
  }

  const target = String(form.get('target') ?? 'new');
  const memo = String(form.get('memo') ?? '').trim();
  let planId: string;
  let sha: string;

  try {
    let slug: string;
    if (target === 'new') {
      slug = toSlug(String(form.get('slug') ?? ''));
      if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) return { error: '주소 이름은 영문 소문자·숫자·하이픈(-)으로 2자 이상 입력해 주세요.' };
      if (IGNORED.has(slug)) return { error: '쓸 수 없는 이름입니다. 다른 이름을 입력해 주세요.' };

      const { data: dup } = await supabase.from('plans').select('id').eq('slug', slug).maybeSingle();
      if (dup) return { error: `"${slug}" 기획서가 이미 있습니다. 수정본이라면 "기존 기획서 수정본"을 선택해 주세요.` };
      if (await repoExists(slug)) return { error: `같은 이름의 저장소(${ORG}/${slug})가 이미 있습니다. 다른 이름을 입력해 주세요.` };

      await createPlanRepo(slug, parsed.title ?? slug);
      const { data: plan, error } = await supabase
        .from('plans')
        .insert({ slug, title: parsed.title ?? slug, repo_url: `https://github.com/${ORG}/${slug}` })
        .select('id')
        .single();
      if (error) return { error: `저장소는 만들었지만 기획서 등록에 실패했습니다: ${error.message}` };
      planId = plan.id;
    } else {
      const { data: plan } = await supabase.from('plans').select('id, slug').eq('id', target).maybeSingle();
      if (!plan) return { error: '기획서를 찾을 수 없습니다.' };
      planId = plan.id;
      slug = plan.slug;
    }

    sha = await commitFiles(slug, parsed.files, `기획서 업로드: ${memo || file.name} (${user.email})`);
  } catch (e) {
    if (e instanceof GitHubError) {
      console.error(e);
      return {
        error: e.status === 401 || e.status === 403
          ? 'GitHub 권한 오류입니다. 관리자에게 토큰 권한(Administration·Contents 쓰기)을 확인해 달라고 요청해 주세요.'
          : `GitHub 오류로 올리지 못했습니다 (${e.status}). 잠시 뒤 다시 시도해 주세요.`,
      };
    }
    throw e;
  }

  revalidatePath('/admin', 'layout');
  redirect(`/admin/plans/${planId}?pending=${sha}&t=${Date.now()}`);
}
