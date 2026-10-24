const fmt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

export const date = (v: string | null | undefined) => (v ? fmt.format(new Date(v)) : '—');

export const STATUS: Record<string, string> = { draft: '초안', active: '공개', archived: '보관' };
