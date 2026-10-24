import { latestPublishRun } from '@/lib/github';
import AutoRefresh from './AutoRefresh';

/* 업로드 직후: plan-publisher 빌드 진행 상황 */
export default async function PublishBanner({ slug, since, done }: { slug: string; since: number; done: boolean }) {
  if (done) return <div className="banner ok">새 버전이 반영되었습니다. 미리보기로 확인해 보세요.</div>;

  let run = null;
  try {
    run = await latestPublishRun(slug, new Date(since - 10_000));
  } catch (e) {
    console.error(e);
  }

  if (run?.status === 'completed' && run.conclusion !== 'success') {
    return (
      <div className="banner bad">
        빌드에 실패했습니다. 기획서 코드에 문제가 있을 수 있습니다.{' '}
        <a href={run.url} target="_blank" rel="noreferrer">실패 기록 보기</a> — 관리자에게 이 링크를 전달해 주세요.
      </div>
    );
  }

  const label = !run ? '빌드를 기다리는 중…' : run.status === 'completed' ? '등록 중…' : '빌드 중… (보통 1~2분)';
  return (
    <div className="banner wait">
      <AutoRefresh seconds={5} />
      {label} 이 화면은 자동으로 새로고침됩니다.
      {run && <> <a href={run.url} target="_blank" rel="noreferrer">진행 상황</a></>}
    </div>
  );
}
