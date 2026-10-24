# PiUS 기획서 포털

외주 기획서를 고객사에 공유하는 사이트 하나 + 자동 등록 파이프라인.

| 폴더 | GitHub 저장소 | 내용 |
|---|---|---|
| `plan-portal/` | `PIUS-plan/plan-portal` | Next.js 포털. 고객: 코드 입력 → `/p/<slug>/` 열람. 관리자: `/admin`. 웹훅 수신 `/api/github/webhook` |
| `plan-publisher/` | `PIUS-plan/plan-publisher` | 중앙 빌드 워크플로: 기획서 저장소 checkout → 빌드 → Supabase Storage 업로드 → 버전 등록 |
| `plan-template/` | `PIUS-plan/plan-template` | 새 기획서 저장소 템플릿: `CLAUDE.md`(웹 Claude Code 가 지킬 규칙) + `.gitignore` |

```
기획서 저장소 main push
  → 조직 웹훅 → 포털 /api/github/webhook (서명 검증)
  → plan-publisher 워크플로 dispatch (repo, sha)
  → 빌드 → Storage plans/<repo>/<sha>/ + register_version()
  → 포털 /admin 에 "초안"으로 등록
관리자: 상태 "공개" + 접근 코드 생성 → 고객에게 코드 또는 https://<포털>/c/<코드> 전달
```

GitHub Free 조직에서는 비공개 저장소가 조직 시크릿을 못 쓰기 때문에, 시크릿은 `plan-publisher` 저장소 한 곳과 Vercel 에만 둔다. 기획서 저장소에는 워크플로도 시크릿도 필요 없다.

## 1회 설정

### 1. Supabase (기존 프로젝트)
1. SQL Editor 에서 `plan-portal/supabase/migrations/0001_init.sql` 실행 (스키마 `plan_portal` + 비공개 버킷 `plans`).
2. Project Settings → Data API → **Exposed schemas** 에 `plan_portal` 추가.
3. Authentication → Users 에서 관리자 계정 생성 → SQL 파일 맨 아래 주석의 `insert into plan_portal.admins ...` 실행.
4. Authentication → Sign In / Providers 에서 **Allow new users to sign up 끄기**.

### 2. GitHub 토큰 (Fine-grained PAT 1개)
GitHub → Settings → Developer settings → Fine-grained tokens → Generate
- Resource owner: **PIUS-plan**, Repository access: **All repositories**
- Permissions: **Contents: Read**, **Actions: Read and write**
- 조직 설정에서 승인이 필요하면 PIUS-plan → Settings → Personal access tokens → Pending requests 에서 승인.

### 3. plan-publisher 저장소 시크릿/변수
`PIUS-plan/plan-publisher` → Settings → Secrets and variables → Actions
- Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PLANS_GITHUB_TOKEN`(위 PAT)
- Variables: `PORTAL_URL` = `https://plan.<도메인>` (선택, 배포 요약에 관리자 링크)

### 4. Vercel
1. `PIUS-plan/plan-portal` Import (Framework: Next.js).
2. 환경변수: `.env.example` 참고. `GITHUB_DISPATCH_TOKEN` = 위 PAT, `GITHUB_WEBHOOK_SECRET` = 임의 문자열, `VIEWER_JWT_SECRET` = `openssl rand -base64 48`.
3. 도메인 `plan.<도메인>` 연결.

### 5. 조직 웹훅
PIUS-plan → Settings → Webhooks → Add webhook
- Payload URL: `https://plan.<도메인>/api/github/webhook`
- Content type: `application/json`, Secret: `GITHUB_WEBHOOK_SECRET` 과 같은 값
- Events: **Just the push event**
- 저장 후 Recent Deliveries 에 ping 이 200 이면 OK.

## 기획자 흐름
1. GitHub → `plan-template` → **Use this template** → `PIUS-plan/<영문-소문자-이름>` (이 이름이 주소 `/p/<이름>/`)
2. 웹 Claude Code 에서 그 저장소로 기획서 작성 → PR → main 머지
3. 1~2분 뒤 포털에 "초안" 등록 (`plan-publisher` Actions 탭에서 진행 확인)

수동 재배포: `plan-publisher` → Actions → Publish plan → Run workflow → 저장소 이름.

## 기존 기획서 옮기기
`PIUS-org/beauty-plan`, `PIUS-org/farm-commerce` 를 PIUS-plan 으로 Transfer(또는 새로 push) 하고 `CLAUDE.md` 를 추가.

## 로컬 개발
```bash
cd plan-portal
cp .env.example .env.local   # 값 채우기
npm install
npm run dev                  # http://localhost:3000
```

## 동작 메모
- 고객 쿠키는 기획서마다 따로(`/p/<slug>` 경로 한정), 최대 7일 또는 코드 만료일까지. 코드를 폐기하거나 기획서를 "보관"으로 바꾸면 바로 막힌다.
- 코드 입력 실패는 IP 당 10분에 10회까지.
- 관리자는 로그인 상태면 코드 없이 모든 기획서·과거 버전(`/p/<slug>/~<버전id>/`)을 미리 볼 수 있다.
- "이 버전으로" 를 누르면 고객에게 보이는 버전이 즉시 바뀐다 (롤백).
