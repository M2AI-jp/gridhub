// 見開きのノート（§50.8）。カメラ（viewBox）で今の見開きを映し、めくるときは <use href="#world"> の葉を回す。
import { U, PAGE, pageOrigin } from './world.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// 1ページずつ（§50.8・§57）: 幅 860px 以下か、縦長の画面（高さ ≧ 幅。ノートは縦の B5 なので、1ページを大きく縦に見せる）
const SINGLE = '(max-width: 860px), (orientation: portrait)';
const narrow = () => matchMedia(SINGLE).matches;
const SVGNS = 'http://www.w3.org/2000/svg';
const FLIP_MS = 900;

export class Book {
  /** svg … svg#board、host … めくる葉を重ねる箱（#view-board） */
  constructor(svg, host, { onChange } = {}) {
    this.svg = svg;
    this.host = host;
    this.onChange = onChange;
    this.pages = 0;
    this.left = 0; // いま見えている左のページ（0始まり。1ページずつのときは、そのページ）
    this.cam = null;
    this.flipping = null;
    this.single = this.wantSingle();
    this.host.classList.toggle('single-page', this.single);
    matchMedia(SINGLE).addEventListener?.('change', () => this.relayout());
    addEventListener('resize', () => this.relayout());
  }

  /** 1ページずつにするか（§57.1）。横長の画面の見開きは今のまま */
  wantSingle() {
    return narrow();
  }

  /** 画面の向きが変わって、1ページずつか見開きかが変わったら、いまのページを含む見せ方で映し直す（§57.4）。変わったら true */
  relayout() {
    const single = this.wantSingle();
    if (single === this.single) return false;
    this.single = single;
    this.host.classList.toggle('single-page', single);
    this.left = this.norm(this.left);
    if (this.pages) this.fit();
    this.onChange?.();
    return true;
  }

  norm(p) {
    const q = Math.max(0, Math.min(this.pages - 1, p));
    return this.single ? q : q - (q % 2);
  }

  /** 見えているページ（0始まり）の一覧 */
  visible() {
    return this.single ? [this.left] : [this.left, this.left + 1].filter((p) => p < this.pages);
  }

  /** 見開き（か1ページ）の世界の四角（px） */
  rectOf(left = this.left) {
    const o = pageOrigin(left);
    const n = this.single ? 1 : Math.min(2, this.pages - left);
    return { x: o.x * U, y: 0, w: n * PAGE.w * U, h: PAGE.h * U };
  }

  setPages(n, firstLeft) {
    const fresh = this.pages === 0;
    this.pages = n;
    if (fresh && firstLeft != null) this.left = this.norm(firstLeft);
    else this.left = this.norm(this.left);
  }

  stageSize() {
    const r = this.svg.getBoundingClientRect();
    return { w: Math.max(200, r.width), h: Math.max(200, r.height) };
  }

  /** 今の見開き全体を映す（「全体」） */
  /** 下の机の帯（めくる・拡大・凡例を置くところ。ノートと重ねない）の高さ px */
  dock() {
    const v = parseFloat(getComputedStyle(this.svg).getPropertyValue('--dock')) || 0;
    return Number.isFinite(v) ? v : 0;
  }

  fit() {
    const { w, h } = this.stageSize();
    const r = this.rectOf();
    const pad = this.single ? 0.3 * U : 0.8 * U;
    const dock = this.dock();
    const avail = Math.max(120, h - dock);
    const scale = Math.min(w / (r.w + 2 * pad), avail / (r.h + 2 * pad));
    this.cam = { scale, x: r.x + (r.w - w / scale) / 2, y: r.y - pad - Math.max(0, (avail / scale - r.h - 2 * pad) / 2), auto: true };
    this.apply();
  }

  apply() {
    if (!this.cam) return;
    const { w, h } = this.stageSize();
    const c = this.cam;
    this.svg.setAttribute('viewBox', `${c.x.toFixed(1)} ${c.y.toFixed(1)} ${(w / c.scale).toFixed(1)} ${(h / c.scale).toFixed(1)}`);
    this.onstage();
  }

  /**
   * 1ページずつのときは、映しているページだけを見せる（§57.3）: となりのページの紙は描かず、盤面の枠をそのページの形に切る
   * （ページの影のぶん少し広く）。見開きでは何もしない。書き出し（#world の写し）には効かない
   */
  onstage() {
    const vis = new Set(this.visible());
    this.svg.classList.toggle('single', this.single);
    for (const pg of this.svg.querySelectorAll('#paper .page[data-page]')) pg.classList.toggle('offstage', this.single && !vis.has(Number(pg.dataset.page) - 1));
    if (!this.single || !this.cam) {
      this.svg.style.clipPath = '';
      return;
    }
    const { w, h } = this.stageSize();
    const c = this.cam;
    const r = this.rectOf();
    const pad = 8;
    const left = Math.max(0, (r.x - c.x) * c.scale - pad);
    const top = Math.max(0, (r.y - c.y) * c.scale - pad);
    const right = Math.max(0, w - ((r.x + r.w - c.x) * c.scale + pad));
    const bottom = Math.max(0, h - ((r.y + r.h - c.y) * c.scale + pad));
    this.svg.style.clipPath = `inset(${top.toFixed(1)}px ${right.toFixed(1)}px ${bottom.toFixed(1)}px ${left.toFixed(1)}px)`;
  }

  zoomAt(factor, cx, cy) {
    const c = this.cam;
    if (!c) return;
    const ns = Math.max(0.25, Math.min(4, c.scale * factor));
    c.x = c.x + cx / c.scale - cx / ns;
    c.y = c.y + cy / c.scale - cy / ns;
    c.scale = ns;
    c.auto = false;
    this.apply();
  }

  pan(dx, dy) {
    if (!this.cam) return;
    this.cam.x += dx / this.cam.scale;
    this.cam.y += dy / this.cam.scale;
    this.cam.auto = false;
    this.apply();
  }

  focusOn(x, y, scale) {
    const { w, h } = this.stageSize();
    if (!this.cam) this.fit();
    const c = this.cam;
    if (scale) c.scale = scale;
    c.x = x - w / c.scale / 2;
    c.y = y - h / c.scale / 2;
    c.auto = false;
    this.svg.classList.add('glide');
    this.apply();
    setTimeout(() => this.svg.classList.remove('glide'), 400);
  }

  /** ページ（1始まり）の見開きへめくる。animate=false か、動きを減らす設定では、めくる動きなしで切り替える */
  turnTo(pageNo, { animate = true } = {}) {
    const to = this.norm(Number(pageNo) - 1);
    if (!Number.isFinite(to)) return Promise.resolve(false);
    if (to === this.left && !this.flipping) {
      if (this.cam && !this.cam.auto) this.fit();
      return Promise.resolve(false);
    }
    if (this.flipping) return this.flipping.then(() => this.turnTo(pageNo, { animate }));
    if (!animate || reduced() || !this.cam) {
      this.left = to;
      this.fit();
      this.onChange?.();
      return Promise.resolve(true);
    }
    this.fit();
    this.flipping = this.flip(this.left, to).then(() => {
      this.left = to;
      this.fit();
      this.flipping = null;
      this.onChange?.();
      return true;
    });
    return this.flipping;
  }

  /** 世界の四角を、host の中の画面の四角に */
  screenRect(r) {
    const m = this.svg.getScreenCTM();
    const host = this.host.getBoundingClientRect();
    const p = (x, y) => {
      const pt = this.svg.createSVGPoint();
      pt.x = x;
      pt.y = y;
      return pt.matrixTransform(m);
    };
    const a = p(r.x, r.y);
    const b = p(r.x + r.w, r.y + r.h);
    return { left: a.x - host.left, top: a.y - host.top, width: b.x - a.x, height: b.y - a.y };
  }

  pageSvg(p) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('class', 'leaf-svg');
    s.setAttribute('preserveAspectRatio', 'none');
    if (p == null || p < 0 || p >= this.pages) {
      s.setAttribute('viewBox', `0 0 ${PAGE.w * U} ${PAGE.h * U}`);
      s.innerHTML = `<rect width="${PAGE.w * U}" height="${PAGE.h * U}" class="page-sheet"/>`;
      return s;
    }
    const o = pageOrigin(p);
    s.setAttribute('viewBox', `${o.x * U} 0 ${PAGE.w * U} ${PAGE.h * U}`);
    const use = document.createElementNS(SVGNS, 'use');
    use.setAttribute('href', '#world');
    s.appendChild(use);
    return s;
  }

  /** めくる: from の見開きから to の見開きへ、1枚の葉が綴じ目を軸に回る */
  flip(from, to) {
    const forward = to > from;
    const one = PAGE.w * U;
    const H = PAGE.h * U;
    const box = document.createElement('div');
    box.className = 'flip-stage';
    const place = (el, p) => {
      const o = pageOrigin(p);
      const r = this.screenRect({ x: o.x * U, y: 0, w: one, h: H });
      Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    };
    const under = (p, at) => {
      const el = document.createElement('div');
      el.className = 'flip-under';
      el.appendChild(this.pageSvg(p));
      place(el, at);
      box.appendChild(el);
    };
    const leaf = document.createElement('div');
    leaf.className = `page-flip ${forward ? 'forward' : 'backward'}`;
    const front = document.createElement('div');
    front.className = 'flip-face front';
    const back = document.createElement('div');
    back.className = 'flip-face back';
    if (this.single) {
      // 1ページずつ: 今のページが綴じ目（左の端）を軸にめくれて、下から次のページが出る
      under(to, from);
      front.appendChild(this.pageSvg(from));
      back.appendChild(this.pageSvg(null));
      place(leaf, from);
      leaf.classList.add(forward ? 'forward' : 'backward');
    } else if (forward) {
      under(to + 1 < this.pages ? to + 1 : null, from + 1);
      front.appendChild(this.pageSvg(from + 1));
      back.appendChild(this.pageSvg(to));
      place(leaf, from + 1);
    } else {
      under(to, from);
      front.appendChild(this.pageSvg(from));
      back.appendChild(this.pageSvg(to + 1));
      place(leaf, from);
    }
    leaf.append(front, back);
    box.appendChild(leaf);
    this.host.appendChild(box);
    return new Promise((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          leaf.classList.add('turning');
        }),
      );
      setTimeout(() => {
        box.remove();
        resolve();
      }, FLIP_MS + 60);
    });
  }
}

export { FLIP_MS };
