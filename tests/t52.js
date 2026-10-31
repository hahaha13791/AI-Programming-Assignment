// 52단계 — ⚙ 악기 고르기. Run with smoke.js.
{
  const ticker = setInterval(() => {}, 10); // file reads and decoding run off the page's thread (pitfalls.md)
  async function until(test, limit = 6000) {
    for (let n = 0; !test() && n < limit; n++) await new Promise((r) => setTimeout(r, 10));
    return test();
  }
  async function heard(act) {
    window.__soundLog = [];
    await act();
    const log = window.__soundLog;
    window.__soundLog = null;
    return log;
  }
  const radio = (name) => document.querySelector(`#settings input[name="instrument"][value="${name}"]`);
  const choose = (name) => {
    radio(name).checked = true;
    radio(name).dispatchEvent(new Event('change', { bubbles: true }));
  };
  const scriptsOf = (name) => document.querySelectorAll(`script[data-instrument="${name}"]`).length;

  T.test('52-2 네 모드의 ⚙와 악기 고르기', async (T) => {
    const top = Math.round(T.$('staff-title').getBoundingClientRect().top);
    for (const m of ['melody', 'harmony', 'rhythm', 'score']) {
      T.setMode(m);
      T.$('btn-settings').click();
      const score = m === 'score';
      T.check(!T.$('btn-settings').hidden && !T.$('settings').hidden && !T.$('settings-instrument').hidden
        && T.$('settings-speed').hidden === !score && T.$('settings-solfege').hidden === !score && (score || T.$('settings-line').hidden),
      `${m}: ⚙에 악기 고르기, 빠르기·계이름·화음 줄은 내 악보에서만`);
      const box = T.$('settings').getBoundingClientRect();
      T.check(box.left >= -0.5 && box.right <= window.innerWidth + 0.5 && T.noHorizontalOverflow(), `${m}: ⚙ 창이 화면 안 (${Math.round(box.left)}~${Math.round(box.right)})`);
      T.check(Math.round(T.$('staff-title').getBoundingClientRect().top) === top, `${m}: 받아 적기 영역 위치 그대로`);
      T.check(radio('piano').checked && T.$('settings-credit').textContent.includes('CC BY 3.0') && T.$('settings-instrument-status').textContent.includes('늘려서'),
        `${m}: 기본 피아노, 출처와 음역 안내`);
      T.$('btn-settings').click();
    }

    // Violin: its file is read once, then everything sounds from it.
    T.setMode('melody');
    T.$('btn-settings').click();
    const statusBox = () => T.$('settings-instrument-status').getBoundingClientRect().height;
    const h0 = statusBox();
    const preview = await heard(async () => {
      choose('violin');
      T.check(Sampler.current === 'violin' && Settings.get('instrument') === 'violin', '고르자마자 바이올린으로 정해짐');
      T.check(['fetching', 'loading'].includes(Sampler.status('violin')) && T.$('settings-instrument-status').textContent.includes('불러오는 중'),
        `불러오는 동안 안내 (${T.$('settings-instrument-status').textContent})`);
      T.check(Math.abs(statusBox() - h0) < 0.5, '안내가 바뀌어도 그 자리 높이가 그대로');
      await until(() => Sampler.ready('violin') && window.__soundLog.length > 0);
    });
    T.check(scriptsOf('violin') === 1 && window.INSTRUMENTS.violin, '바이올린 파일을 한 번 불러옴');
    T.check(preview.length === 8 && preview.every((e) => e.kind === 'sample' && e.instrument === 'violin') && preview[0].midi === 60,
      `고르면 바이올린으로 도~높은 도 음계를 미리 들려줌 (${preview.length}음)`);
    T.check(T.$('settings-instrument-status').textContent.includes('늘려서'), '다 불러오면 음역 안내로 돌아감');
    T.$('btn-settings').click();
    const melody = await heard(() => T.listen());
    T.check(melody.length > 0 && melody.every((e) => e.kind === 'sample' && e.instrument === 'violin'), '멜로디 문제도 바이올린');
    T.setMode('rhythm');
    const rhythm = await heard(() => T.listen());
    T.check(rhythm.filter((e) => e.kind === 'sample').every((e) => e.instrument === 'violin') && rhythm.some((e) => e.kind === 'synth'), '리듬도 바이올린, 카운트인은 클릭');
    // Below the violin's lowest recording (G3): the end one stretched, the pitch right.
    const low = Sampler.pick('violin', 48);
    T.check(low.sample.midi === 55 && Math.abs(low.rate - 2 ** ((48 - 55 - low.sample.tune / 100) / 12)) < 1e-9, '바이올린 음역 밖(C3)은 G3 녹음을 늘림');

    // Again: no second read. The others.
    T.$('btn-settings').click();
    choose('violin');
    T.check(scriptsOf('violin') === 1, '같은 악기를 다시 골라도 다시 불러오지 않음');
    for (const name of ['flute', 'marimba', 'harp']) {
      choose(name);
      T.check(await until(() => Sampler.ready(name)), `${window.INSTRUMENTS[name]?.label ?? name} 불러와 풀림`);
    }
    T.check(JSON.parse(localStorage.getItem(Settings.STORAGE_KEY)).instrument === 'harp', '고른 악기를 브라우저에 기억 (다시 열면 그 악기)');

    // A file that can't be read: said, and the synthesized tone goes on.
    let failed = null;
    Sampler.load('no-such-instrument', (ok) => { failed = ok; });
    await until(() => failed !== null);
    T.check(failed === false && Sampler.status('no-such-instrument') === 'failed' && instrumentStatusText('no-such-instrument').includes('불러오지 못했어요'),
      '파일을 읽지 못하면 "불러오지 못했어요" (합성음으로 계속)');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new Error('quota'); };
    T.check(Settings.set('instrument', 'flute') === false, '저장할 수 없는 환경: 기억하지 못함 (다음 방문은 기본 피아노)');
    Storage.prototype.setItem = original;

    choose('piano');
    T.$('btn-settings').click();
    localStorage.removeItem(Settings.STORAGE_KEY);
    T.setMode('melody');
    clearInterval(ticker);
  });
}
