// 70단계 — 한 쪽 인식 시간. 가상 시간에서는 계산 시간이 재지지 않으므로, 이 파일만 한 폭(375px)으로 돌린 시간에서
// 빈 실행 시간을 빼서 잰다(tools 없이 셸에서). 공유저작물 인쇄 악보 fixture를 먼저 붙인다.
{
  const ticker = setInterval(() => {}, 1);
  T.test('70-2 한 쪽(긴 변 2000px) 인식', async (T) => {
    const sample = (window.OMR_SAMPLES ?? []).find((s) => s.id === 'bwv1007') ?? window.OMR_SAMPLES?.[0];
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sample.data.replace(/currentColor/g, '#000'))}`;
    await img.decode();
    const scale = 2000 / Math.max(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const page = OmrImage.flatten(canvas, OmrImage.frameCorners(canvas));
    const analyses = await OmrBuild.recognize([page]);
    T.check(analyses && analyses[0].staves.length >= 5, `${canvas.width}×${canvas.height}, 보표 ${analyses?.[0].staves.length}`);
    clearInterval(ticker);
  });
}
