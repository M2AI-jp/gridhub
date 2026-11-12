// はじめの画面の帯（CONTRACTS §80.19）: 仲間が走る横スクロール。飾りで、何も読み書きしない。盤面の担当
// 舞台は進軍と同じ描き直した場所（art/places.js の村）。仲間は描き直した絵の走り（6 枚）
import { compose, POSES, toCanvas, mob, FOOT, CENTER, hasArt } from './march-art.js';
import { buildPlace } from './art/places.js';
import { toCanvas as surfaceCanvas, LW } from './art/sprite.js';

const CREW = [['hero', 'purple'], ['sage', 'blue'], ['scribe', 'yellow'], ['herald', 'green'], ['priest', 'gray'], ['mage', 'mint'], ['cartographer', 'orange'], ['painter', 'pink'], ['villager', 'orange']];
const H = 64;

export function startMarch(host) {
  if (!host) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'start-march-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = 480;
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false;
  const place = buildPlace('village3', H);
  const layers = place.layers.map((L) => ({ k: L.k, img: surfaceCanvas(L.s) }));
  const ground = place.ground;
  const runs = (job) => (hasArt(job) ? ['run0', 'run1', 'run2', 'run3', 'run4', 'run5'] : ['run0', 'run1', 'run2', 'run3']);
  const sets = CREW.map(([job, color]) => runs(job).map((p) => toCanvas(compose(job, POSES[p], color))));
  const foe = [0, 1].map((f) => toCanvas(mob('imp', 'red', f)));
  let tick = 0;
  function frame() {
    tick++;
    const scroll = calm ? 0 : tick * 0.8;
    for (const L of layers) {
      const sx = ((Math.round(scroll * L.k) % LW) + LW) % LW;
      ctx.drawImage(L.img, -sx, 0);
      if (LW - sx < W) ctx.drawImage(L.img, LW - sx, 0);
    }
    sets.forEach((set, i) => {
      const img = set[calm ? 0 : Math.floor(tick / 5 + i * 2) % set.length];
      ctx.fillStyle = 'rgba(20,18,8,.55)';
      ctx.fillRect(22 + i * 46 - 6, ground + 1, 13, 1);
      ctx.drawImage(img, 22 + i * 46 - CENTER, ground - FOOT);
    });
    const f = foe[calm ? 0 : Math.floor(tick / 14) % 2];
    ctx.drawImage(f, W - 30, ground - f.height + 2);
    if (!calm && !document.hidden) requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !calm) requestAnimationFrame(frame); });
  frame();
}
