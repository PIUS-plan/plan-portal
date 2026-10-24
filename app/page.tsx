import CodeForm from './CodeForm';

export default async function Home({ searchParams }: { searchParams: Promise<{ e?: string; p?: string }> }) {
  const { e, p } = await searchParams;

  return (
    <main className="gate">
      <div className="gate-card">
        <img src="/logo.png" alt="PiUS" className="gate-logo" />
        <h1>기획서 열람</h1>
        <p className="muted">
          {p ? '이 기획서를 보려면 PiUS 에서 전달받은 접근 코드를 입력해 주세요.' : 'PiUS 에서 전달받은 접근 코드를 입력해 주세요.'}
        </p>
        <CodeForm initialError={e} />
      </div>
      <footer className="gate-foot">© PiUS · 본 기획서는 수신 기업 내부 검토용입니다.</footer>
    </main>
  );
}
