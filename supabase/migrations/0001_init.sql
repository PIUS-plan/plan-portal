-- PiUS 기획서 포털 스키마
-- Supabase SQL Editor 에서 한 번 실행한다.
-- 실행 후: Project Settings → Data API → Exposed schemas 에 `plan_portal` 추가.

create schema if not exists plan_portal;
grant usage on schema plan_portal to anon, authenticated, service_role;

-- 관리자: auth.users 중 여기에 있는 사람만 /admin 접근
create table plan_portal.admins (
  user_id    uuid primary key references auth.users on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

-- 기획서 1개 = GitHub 저장소 1개 (slug = 저장소 이름)
create table plan_portal.plans (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9][a-z0-9._-]*$'),
  title              text not null,
  client_name        text,
  repo_url           text,
  status             text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  current_version_id uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- main 에 push 될 때마다 1개 (Storage: plans/<slug>/<sha>/...)
create table plan_portal.plan_versions (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references plan_portal.plans on delete cascade,
  commit_sha     text not null,
  commit_message text,
  storage_prefix text not null,
  deployed_at    timestamptz not null default now(),
  unique (plan_id, commit_sha)
);

alter table plan_portal.plans
  add constraint plans_current_version_fk
  foreign key (current_version_id) references plan_portal.plan_versions on delete set null;

-- 고객사에 전달하는 접근 코드 (평문은 저장하지 않음)
create table plan_portal.access_codes (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plan_portal.plans on delete cascade,
  code_hash  text not null unique,
  code_hint  text not null,
  label      text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index on plan_portal.access_codes (plan_id);

-- 열람 기록 (기획서 문서를 열 때마다 1개)
create table plan_portal.access_logs (
  id         bigint generated always as identity primary key,
  plan_id    uuid not null references plan_portal.plans on delete cascade,
  code_id    uuid references plan_portal.access_codes on delete set null,
  ip         text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index on plan_portal.access_logs (plan_id, created_at desc);

-- 코드 입력 실패 기록 (IP 단위 시도 제한용, 서버 전용)
create table plan_portal.access_attempts (
  id         bigint generated always as identity primary key,
  ip         text not null,
  created_at timestamptz not null default now()
);
create index on plan_portal.access_attempts (ip, created_at desc);

-- updated_at 자동 갱신
create function plan_portal.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger plans_touch before update on plan_portal.plans
  for each row execute function plan_portal.touch_updated_at();

-- 관리자 여부
create function plan_portal.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from plan_portal.admins where user_id = auth.uid());
$$;
revoke all on function plan_portal.is_admin() from public;
grant execute on function plan_portal.is_admin() to authenticated;

-- GitHub Actions 가 배포 후 호출: 기획서가 없으면 draft 로 만들고, 새 버전을 현재 버전으로 지정
create function plan_portal.register_version(
  p_slug text, p_title text, p_repo_url text, p_sha text, p_message text, p_prefix text
) returns plan_portal.plans
language plpgsql security definer set search_path = '' as $$
declare
  v_plan_id    uuid;
  v_version_id uuid;
  r            plan_portal.plans;
begin
  insert into plan_portal.plans (slug, title, repo_url)
  values (p_slug, p_title, p_repo_url)
  on conflict (slug) do update set repo_url = excluded.repo_url
  returning id into v_plan_id;

  insert into plan_portal.plan_versions (plan_id, commit_sha, commit_message, storage_prefix)
  values (v_plan_id, p_sha, p_message, p_prefix)
  on conflict (plan_id, commit_sha) do update
    set storage_prefix = excluded.storage_prefix, deployed_at = now()
  returning id into v_version_id;

  update plan_portal.plans set current_version_id = v_version_id
  where id = v_plan_id
  returning * into r;

  return r;
end $$;
revoke all on function plan_portal.register_version(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function plan_portal.register_version(text, text, text, text, text, text) to service_role;

-- 관리자 목록 화면용
create view plan_portal.plan_overview with (security_invoker = true) as
select
  p.*,
  v.commit_sha,
  v.deployed_at,
  (select count(*) from plan_portal.access_logs l where l.plan_id = p.id)        as view_count,
  (select max(l.created_at) from plan_portal.access_logs l where l.plan_id = p.id) as last_viewed_at,
  (select count(*) from plan_portal.access_codes c
    where c.plan_id = p.id and c.revoked_at is null
      and (c.expires_at is null or c.expires_at > now()))                        as active_codes
from plan_portal.plans p
left join plan_portal.plan_versions v on v.id = p.current_version_id;

-- 권한: 관리자(authenticated + is_admin)만, 고객은 서버(service_role)를 통해서만
grant select, insert, update, delete on all tables in schema plan_portal to authenticated;
grant all on all tables in schema plan_portal to service_role;
grant usage, select on all sequences in schema plan_portal to authenticated, service_role;

alter table plan_portal.admins          enable row level security;
alter table plan_portal.plans           enable row level security;
alter table plan_portal.plan_versions   enable row level security;
alter table plan_portal.access_codes    enable row level security;
alter table plan_portal.access_logs     enable row level security;
alter table plan_portal.access_attempts enable row level security;

create policy admins_read on plan_portal.admins for select to authenticated
  using (user_id = auth.uid() or plan_portal.is_admin());
create policy plans_admin on plan_portal.plans for all to authenticated
  using (plan_portal.is_admin()) with check (plan_portal.is_admin());
create policy versions_admin on plan_portal.plan_versions for all to authenticated
  using (plan_portal.is_admin()) with check (plan_portal.is_admin());
create policy codes_admin on plan_portal.access_codes for all to authenticated
  using (plan_portal.is_admin()) with check (plan_portal.is_admin());
create policy logs_admin on plan_portal.access_logs for select to authenticated
  using (plan_portal.is_admin());
-- access_attempts: 정책 없음 → service_role 만 접근

-- 빌드 결과물 저장소 (비공개)
insert into storage.buckets (id, name, public)
values ('plans', 'plans', false)
on conflict (id) do nothing;

-- 관리자 등록 (Authentication → Users 에서 사용자를 만든 뒤 이메일을 바꿔 실행)
-- insert into plan_portal.admins (user_id, email)
-- select id, email from auth.users where email = 'you@example.com';
