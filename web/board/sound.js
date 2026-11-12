// 小さな効果音（WebAudio）。はじめは鳴らない。♪ボタンで切り替え、選択はこのブラウザに覚えておく。
const KEY = 'masume.sound';

const TUNES = {
  up: [[659, 0.09], [784, 0.09], [1047, 0.16]],
  down: [[392, 0.14], [330, 0.14], [262, 0.26]],
  fanfare: [[523, 0.1], [523, 0.1], [523, 0.1], [698, 0.28], [880, 0.14], [1047, 0.4]],
  // 勇者の手帳（§79）: シールが落ちる・開ける・称号
  hit: [[880, 0.04], [1175, 0.06]],
  drop: [[988, 0.07], [1319, 0.12]],
  normal: [[784, 0.08], [988, 0.12]],
  kira: [[1047, 0.07], [1319, 0.07], [1568, 0.07], [2093, 0.16]],
  holo: [[784, 0.07], [988, 0.07], [1175, 0.07], [1568, 0.07], [1976, 0.09], [2349, 0.22]],
  gold: [[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.18], [784, 0.09], [1047, 0.09], [1319, 0.09], [1568, 0.42]],
  achieve: [[784, 0.1], [988, 0.1], [1175, 0.1], [1568, 0.3]],
};

// 進軍の曲（§80.15。このゲームのために作った短いループ）。音の高さは MIDI の番号、0 は休み。1つが8分音符
const MUSIC = {
  march: {
    bpm: 132,
    lead: [67, 0, 72, 0, 76, 74, 72, 0, 69, 0, 74, 0, 77, 76, 74, 0, 72, 0, 76, 0, 79, 77, 76, 74, 72, 71, 69, 71, 72, 0, 0, 0],
    bass: [48, 0, 55, 0, 48, 0, 55, 0, 50, 0, 57, 0, 50, 0, 57, 0, 48, 0, 55, 0, 48, 0, 55, 0, 43, 0, 50, 0, 48, 0, 43, 0],
  },
  boss: {
    bpm: 168,
    lead: [69, 0, 69, 72, 71, 0, 69, 0, 65, 0, 65, 69, 67, 0, 65, 0, 64, 0, 64, 67, 69, 0, 71, 0, 72, 71, 69, 68, 69, 0, 0, 0],
    bass: [45, 45, 57, 45, 45, 45, 57, 45, 41, 41, 53, 41, 41, 41, 53, 41, 40, 40, 52, 40, 40, 40, 52, 40, 45, 45, 57, 45, 45, 45, 57, 45],
  },
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

  /** 曲を切り替える。描くたびに呼んでよい。呼ばれなくなる（画面が隠れる）と1秒で止まる。null で止める */
  music(name) {
    this.seen = Date.now();
    const next = this.on ? name : null;
    if (next === (this.track ?? null)) return;
    this.track = next;
    clearInterval(this.timer);
    if (!next) return;
    try {
      this.ctx ||= new AudioContext();
      this.ctx.resume?.();
      this.step = 0;
      this.at = this.ctx.currentTime + 0.05;
      this.timer = setInterval(() => this.pump(), 100);
      this.pump();
    } catch {
      this.track = null;
    }
  }

  pump() {
    if (Date.now() - this.seen > 1000) return this.music(null);
    const song = MUSIC[this.track];
    if (!song) return;
    const beat = 60 / song.bpm / 2;
    while (this.at < this.ctx.currentTime + 0.3) {
      const k = this.step % song.lead.length;
      this.note(song.lead[k], this.at, beat * 0.9, 'square', 0.022);
      this.note(song.bass[k], this.at, beat * 0.8, 'triangle', 0.06);
      this.at += beat;
      this.step += 1;
    }
  }

  note(midi, at, dur, type, vol) {
    if (!midi) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    // 音を保ってから短く消す（すぐ減衰させると小さなスピーカーでは聞こえない）
    gain.gain.setValueAtTime(vol, at);
    gain.gain.linearRampToValueAtTime(vol * 0.6, at + dur * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  play(name) {
    if (!this.on) return;
    if (name === 'rip') return this.rip();
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

  /** 紙の袋をやぶる音（白い雑音を、高いほうだけ通して短く） */
  rip() {
    try {
      this.ctx ||= new AudioContext();
      const t = this.ctx.currentTime + 0.01;
      const len = Math.floor(this.ctx.sampleRate * 0.32);
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) * (0.6 + 0.4 * Math.sin(i / 90));
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1800;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      src.connect(filter).connect(gain).connect(this.ctx.destination);
      src.start(t);
    } catch {}
  }
}
