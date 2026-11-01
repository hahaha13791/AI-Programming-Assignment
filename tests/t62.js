// 62단계 — 인쇄. Run with smoke.js.
{
  const choose = (id) => {
    T.$('score-select').value = id;
    T.$('score-select').dispatchEvent(new Event('change'));
  };
  // Every rule inside @media print in the page's style sheets.
  function printRules() {
    const rules = [];
    for (const sheet of document.styleSheets) {
      let list;
      try { list = sheet.cssRules; } catch { continue; }
      for (const rule of list) {
        if (rule instanceof CSSMediaRule && rule.media.mediaText.includes('print')) rules.push(...rule.cssRules);
      }
    }
    return rules;
  }

  T.test('62-2 [인쇄]가 인쇄 창을 부름', async (T) => {
    T.setMode('score');
    choose('example-twinkle');
    T.$('btn-view-score').click();
    const real = window.print;
    let called = 0;
    window.print = () => { called++; };
    T.$('viewer-print').click();
    window.print = real;
    T.check(called === 1, '[인쇄] → window.print()');
  });

  T.test('62-2 인쇄용 규칙, 화면 모양은 그대로', async (T) => {
    const rules = printRules();
    const text = rules.map((r) => r.cssText).join('\n');
    T.check(text.includes('.app[data-viewing] > :not(#viewer)') && /display:\s*none/.test(text), '인쇄: 보기 화면 밖(탭·패널)은 숨김');
    T.check(text.includes('.viewer-head') && text.includes('.viewer-note'), '인쇄: 버튼 줄·방식 안내도 숨김(제목과 악보만)');
    T.check(/break-inside:\s*avoid/.test(text), '인쇄: 줄 하나가 두 쪽으로 잘리지 않음');
    T.check(/max-width:\s*100%/.test(text), '인쇄: 악보 줄을 쪽 너비에 맞춤');
    T.check(rules.some((r) => r.cssText.includes('@page') || r.constructor.name === 'CSSPageRule') || text.includes('margin: 14mm'), '쪽 여백');
    // 화면에서는 그대로.
    T.check(getComputedStyle(document.querySelector('.mode-tabs')).display !== 'none' && getComputedStyle(T.$('viewer-print')).display !== 'none',
      '화면: 탭과 [인쇄] 그대로 보임');
  });

  T.test('62-2 인쇄 직전에 쪽 너비로 다시 그리고, 끝나면 화면으로', async (T) => {
    T.setMode('score');
    choose('example-twinkle');
    T.$('btn-view-score').click();
    const rows = () => T.$('viewer-sheet').querySelectorAll('.sheet-row').length;
    const before = rows();
    window.dispatchEvent(new Event('beforeprint'));
    T.check(T.$('viewer-sheet').style.width === '680px' && rows() === 3, `인쇄용: 한 줄 4마디 (12마디 → ${rows()}줄)`);
    T.check(T.$('viewer-sheet').querySelectorAll('.sv-solfege').length === 42, '인쇄용에도 계이름');
    window.dispatchEvent(new Event('afterprint'));
    T.check(T.$('viewer-sheet').style.width === '' && rows() === before, `인쇄 뒤 화면 그대로 (${before}줄)`);
    T.$('viewer-close').click();
    // 보기 화면이 닫혀 있으면 인쇄 이벤트는 아무것도 하지 않음.
    window.dispatchEvent(new Event('beforeprint'));
    T.check(T.$('viewer').hidden && !T.$('viewer-sheet').style.width, '보기 화면이 닫혀 있으면 그대로');
    window.dispatchEvent(new Event('afterprint'));
    T.check(T.noHorizontalOverflow(), '가로 넘침 없음');
    T.setMode('melody');
  });
}
