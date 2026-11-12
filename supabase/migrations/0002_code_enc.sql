-- 접근 코드를 관리자가 나중에 다시 볼 수 있도록 암호화해서 보관 (AES-256-GCM, 키는 서버 환경변수에서 파생)
-- 이 컬럼이 생기기 전에 만든 코드는 다시 볼 수 없음
alter table plan_portal.access_codes add column if not exists code_enc text;
notify pgrst, 'reload schema';
