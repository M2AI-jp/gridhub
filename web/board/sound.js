// 小さな効果音（WebAudio）。はじめは鳴らない。♪ボタンで切り替え、選択はこのブラウザに覚えておく。
const KEY = 'masume.sound';

const TUNES = {
  up: [[659, 0.09], [784, 0.09], [1047, 0.16]],
  down: [[392, 0.14], [330, 0.14], [262, 0.26]],
  fanfare: [[523, 0.1], [523, 0.1], [523, 0.1], [698, 0.28], [880, 0.14], [1047, 0.4]],
};

export class Sound {
  constructor() {
    try {
      this.on = localStorage.getItem(KEY) === '1';
    } catch {
      this.on = false;
    }
    this.ctx = null;
  }

  toggle() {
    this.on = !this.on;
    try {
      localStorage.setItem(KEY, this.on ? '1' : '0');
    } catch {}
  }

  play(name) {
    if (!this.on) return;
    const tune = TUNES[name];
    if (!tune) return;
    try {
      this.ctx ||= new AudioContext();
      let t = this.ctx.currentTime + 0.02;
      for (const [freq, dur] of tune) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
        t += dur * 0.92;
      }
    } catch {}
  }
}
