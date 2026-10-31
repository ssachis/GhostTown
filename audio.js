/*
 * GhostTown audio — an original spooky waltz and sound effects, synthesized
 * live with the Web Audio API (no audio files). Browsers only allow sound after
 * a click or key press, so Sound.unlock() is called on the first input.
 */
(() => {
  'use strict';
  let ac = null, master, musicBus, sfxBus;
  let musicOn = true;
  try { musicOn = localStorage.getItem('gt-music') !== 'off'; } catch (e) { /* storage blocked */ }

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function init() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.8; master.connect(ac.destination);
    musicBus = ac.createGain(); musicBus.gain.value = musicOn ? 0.14 : 0; musicBus.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.5; sfxBus.connect(master);
    // a little cavernous echo on the music
    const delay = ac.createDelay(1); delay.delayTime.value = 0.33;
    const fb = ac.createGain(); fb.gain.value = 0.28;
    const wet = ac.createGain(); wet.gain.value = 0.25;
    musicBus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
    return true;
  }

  function tone(bus, type, freq, t, dur, vol, opts = {}) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    if (opts.vib) {
      const l = ac.createOscillator(), lg = ac.createGain();
      l.frequency.value = 5.5; lg.gain.value = freq * 0.012;
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.1);
    }
    const a = opts.attack || 0.01;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(bus, t, dur, vol, hp) {
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(); s.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 6000;
    const g = ac.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(bus); s.start(t);
  }

  // ---------- music: 16-bar waltz in D minor, 3/4 ----------
  // each bar: [bass root, chord tones, melody as [note, beats] pairs]
  const DM = [50, [62, 65, 69]], GM = [43, [62, 67, 70]], A7 = [45, [61, 64, 67]], BB = [46, [62, 65, 70]], C = [48, [60, 64, 67]], F = [41, [60, 65, 69]];
  const SONG = [
    [DM, [[69, 1], [74, 1], [77, 1]]],
    [DM, [[76, 1], [74, 1], [69, 1]]],
    [GM, [[70, 1], [74, 1], [79, 1]]],
    [A7, [[77, 1], [76, 1], [73, 1]]],
    [DM, [[74, 1], [77, 1], [81, 1]]],
    [BB, [[82, 2], [81, 1]]],
    [GM, [[79, 1], [77, 1], [76, 1]]],
    [A7, [[73, 2], [69, 1]]],
    [F, [[72, 1], [77, 0.5], [76, 0.5], [77, 1]]],
    [C, [[79, 1], [76, 1], [72, 1]]],
    [DM, [[74, 1], [77, 0.5], [76, 0.5], [74, 1]]],
    [A7, [[73, 1], [76, 1], [79, 1]]],
    [BB, [[77, 1], [74, 1], [70, 1]]],
    [GM, [[70, 1], [74, 1], [77, 1]]],
    [A7, [[76, 1.5], [77, 0.5], [76, 0.5], [73, 0.5]]],
    [DM, [[74, 3]]],
  ];
  const BEAT = 60 / 132;
  let nextBar = 0, barIdx = 0, timer = null, loops = 0;

  function scheduleBar(bar, t) {
    const [[root, chord], mel] = bar;
    tone(musicBus, 'triangle', midi(root), t, BEAT * 0.9, 0.35);
    tone(musicBus, 'sine', midi(root - 12), t, BEAT * 0.9, 0.35);
    for (const b of [1, 2]) for (const n of chord) tone(musicBus, 'triangle', midi(n), t + b * BEAT, BEAT * 0.35, 0.09);
    let o = 0;
    const lead = loops % 2 ? 'sine' : 'triangle';
    for (const [n, beats] of mel) {
      tone(musicBus, lead, midi(n), t + o * BEAT, beats * BEAT * 0.95, lead === 'sine' ? 0.2 : 0.2, { vib: beats >= 1, attack: 0.02 });
      if (loops % 2 === 0) tone(musicBus, 'sine', midi(n + 12), t + o * BEAT, beats * BEAT * 0.6, 0.04);
      o += beats;
    }
  }

  function startMusic() {
    if (timer || !ac) return;
    nextBar = ac.currentTime + 0.1; barIdx = 0;
    timer = setInterval(() => {
      while (nextBar < ac.currentTime + 0.4) {
        scheduleBar(SONG[barIdx], nextBar);
        nextBar += 3 * BEAT;
        if (++barIdx === SONG.length) { barIdx = 0; loops++; }
      }
    }, 100);
  }

  // ---------- sound effects ----------
  const SFX = {
    jump(t) { tone(sfxBus, 'square', 300, t, 0.12, 0.12, { to: 620 }); },
    candy(t) { [76, 81, 88].forEach((n, i) => tone(sfxBus, 'triangle', midi(n), t + i * 0.06, 0.18, 0.25)); },
    pumpkin(t) { [64, 71, 76].forEach((n, i) => tone(sfxBus, 'sine', midi(n), t + i * 0.07, 0.25, 0.3, { vib: true })); },
    click(t) { tone(sfxBus, 'square', 180, t, 0.05, 0.12); noise(sfxBus, t, 0.03, 0.15, 3000); },
    die(t) { tone(sfxBus, 'sawtooth', 420, t, 0.6, 0.18, { to: 60 }); noise(sfxBus, t, 0.4, 0.12, 800); },
    win(t) { [62, 66, 69, 74, 78, 81].forEach((n, i) => tone(sfxBus, 'triangle', midi(n), t + i * 0.09, 0.4, 0.22)); },
  };

  window.Sound = {
    unlock() {
      if (!init()) return;
      if (ac.state === 'suspended') ac.resume();
      startMusic();
    },
    play(name) { if (ac && ac.state === 'running' && SFX[name]) SFX[name](ac.currentTime + 0.01); },
    get musicOn() { return musicOn; },
    toggleMusic() {
      musicOn = !musicOn;
      try { localStorage.setItem('gt-music', musicOn ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
      if (ac) musicBus.gain.setTargetAtTime(musicOn ? 0.14 : 0, ac.currentTime, 0.1);
      return musicOn;
    },
  };
})();
