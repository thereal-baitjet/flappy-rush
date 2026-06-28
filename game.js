/* =========================================================================
   FLAPPY RUSH — single-file HTML5 Canvas game
   Santos Automation • v1.0.0-mvp
   ========================================================================= */
(() => {
'use strict';

/* ---------- Canvas setup (9:16 internal resolution) ---------- */
const W = 405, H = 720;                 // logical resolution
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

/* ---------- Persistence ---------- */
const DB = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const State = {
  coins:      DB.get('fr_total_coins', 0),
  scores:     DB.get('fr_high_scores', []),
  unlocked:   DB.get('fr_unlocked_skins', ['default']),
  equipped:   DB.get('fr_equipped_skin', 'default'),
  achieve:    DB.get('fr_achievements', []),
  ghost:      DB.get('fr_best_ghost', null),
  settings:   DB.get('fr_settings', { music:true, sfx:true, doubleJump:false, difficulty:'normal', mode:'endless' }),
  daily:      DB.get('fr_daily', { dateKey:'', completed:false }),
  lifetime:   DB.get('fr_lifetime_coins', 0)
};
function save() {
  DB.set('fr_total_coins', State.coins);
  DB.set('fr_high_scores', State.scores);
  DB.set('fr_unlocked_skins', State.unlocked);
  DB.set('fr_equipped_skin', State.equipped);
  DB.set('fr_achievements', State.achieve);
  DB.set('fr_best_ghost', State.ghost);
  DB.set('fr_settings', State.settings);
  DB.set('fr_daily', State.daily);
  DB.set('fr_lifetime_coins', State.lifetime);
}

/* ---------- Skins ---------- */
const SKINS = [
  { id:'default',       name:'Classic',  cost:0,   body:'#ffd23f', wing:'#ff7b00', trail:'#ffe08a' },
  { id:'chrome_hearts', name:'Chrome',   cost:150, body:'#dfe9f3', wing:'#9fb4c7', trail:'#ffffff' },
  { id:'gold_chain',    name:'Gold Drip',cost:250, body:'#ffcf33', wing:'#b8860b', trail:'#fff1a8' },
  { id:'atm',           name:'ATM Bird', cost:400, body:'#39d98a', wing:'#1c7a4d', trail:'#9bffd0' },
  { id:'santos',        name:'Santos',   cost:500, body:'#ff5e5e', wing:'#7a1c1c', trail:'#ffb3b3' }
];
const skinById = id => SKINS.find(s => s.id === id) || SKINS[0];

/* ---------- Achievements ---------- */
const ACHIEVEMENTS = [
  { id:'first_50',         name:'First 50',          desc:'Score 50 in one run' },
  { id:'purist',           name:'No-Power-Ups Hero', desc:'Score 20 using zero power-ups' },
  { id:'coin_millionaire', name:'Coin Millionaire',  desc:'Earn 1000 lifetime coins' },
  { id:'combo_king',       name:'Combo King',        desc:'Reach a 5x multiplier' },
  { id:'collector',        name:'Collector',         desc:'Own every skin' }
];

/* ---------- Difficulty ---------- */
const DIFF = {
  easy:   { gap:185, scroll:2.5, moving:Infinity, gravZones:false },
  normal: { gap:155, scroll:3.0, moving:15,       gravZones:false },
  insane: { gap:125, scroll:3.8, moving:0,        gravZones:true  }
};

/* ---------- Power-ups ---------- */
const PU_TYPES = ['shield','slow_mo','magnet','tiny'];
const PU_ICON = { shield:'🛡️', slow_mo:'🐌', magnet:'🧲', tiny:'🔻' };

/* =========================================================================
   AUDIO — Web Audio API procedural SFX + layered music
   ========================================================================= */
const Audio = (() => {
  let ac = null, musicGain = null, sfxOn = () => State.settings.sfx, playing = false;
  const stems = [];
  function ensure() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = ac.createGain(); musicGain.gain.value = 0.16; musicGain.connect(ac.destination);
  }
  function resume() { ensure(); if (ac.state === 'suspended') ac.resume(); }
  function beep(freq, dur, type = 'square', vol = 0.2, slide = 0) {
    if (!sfxOn()) return; ensure();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ac.currentTime + dur);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
  }
  const sfx = {
    flap:  () => beep(420, 0.12, 'square', 0.15, 180),
    score: () => beep(880, 0.10, 'sine', 0.18, 220),
    coin:  () => { beep(1200,0.06,'square',0.12); setTimeout(()=>beep(1600,0.08,'square',0.12),50); },
    power: () => { beep(660,0.08,'sawtooth',0.14,200); setTimeout(()=>beep(990,0.12,'sawtooth',0.14,200),70); },
    crash: () => beep(180, 0.4, 'sawtooth', 0.3, -120),
    badge: () => { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,0.18,'triangle',0.18),i*90)); }
  };
  // simple layered loop: bass + arp + lead, faded in by score
  function startMusic() {
    if (!State.settings.music || playing) return; ensure(); resume(); playing = true;
    const root = 220, scale = [0,3,5,7,10,12];
    function makeStem(getNote, type, baseVol) {
      const g = ac.createGain(); g.gain.value = 0; g.connect(musicGain);
      const s = { gain:g, baseVol, step:0, getNote, type };
      stems.push(s); return s;
    }
    makeStem(i => root/2, 'sine', 0.6);                                   // bass drone
    makeStem(i => root*Math.pow(2, scale[i%scale.length]/12), 'triangle', 0.4); // arp
    makeStem(i => root*2*Math.pow(2, scale[(i*2)%scale.length]/12), 'square', 0.18); // lead
    let step = 0;
    musicTimer = setInterval(() => {
      if (!playing) return;
      stems.forEach(s => {
        const f = s.getNote(step);
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = s.type; o.frequency.value = f;
        const v = s.gain.gain.value;
        g.gain.setValueAtTime(0, ac.currentTime);
        g.gain.linearRampToValueAtTime(v, ac.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.38);
        o.connect(g); g.connect(musicGain); o.start(); o.stop(ac.currentTime + 0.4);
      });
      step++;
    }, 250);
  }
  let musicTimer = null;
  function stopMusic() { playing = false; if (musicTimer) clearInterval(musicTimer); stems.length = 0; }
  function setLayers(score) {
    if (!stems.length) return;
    stems[0].gain.gain.value = stems[0].baseVol;
    stems[1] && (stems[1].gain.gain.value = score >= 10 ? stems[1].baseVol : 0);
    stems[2] && (stems[2].gain.gain.value = score >= 25 ? stems[2].baseVol : 0);
  }
  return { resume, sfx, startMusic, stopMusic, setLayers };
})();

/* =========================================================================
   GAME STATE
   ========================================================================= */
const G = {
  scene:'menu',            // menu | playing | dying | over
  bird:{ x:110, y:H/2, vy:0, r:15, rot:0, dashCd:0 },
  pipes:[], coins:[], powerups:[], particles:[], zones:[], trail:[],
  score:0, runCoins:0, combo:0, comboTimer:0, maxCombo:0, mult:1,
  scroll:3, distance:0, spawnX:0,
  shake:0, timescale:1, gravSign:1,
  buffs:{},                // type -> remaining seconds
  usedPowerup:false,
  shake_x:0, shake_y:0,
  zoom:1, zoomTarget:1,
  deathTimer:0, invuln:0,
  ghostRec:[], ghostFrame:0, ghostY:null,
  cfg:null
};
let gravity = 0.5, flapImpulse = -8.5, maxFall = 12;

/* ---------- helpers ---------- */
const rand = (a,b) => a + Math.random()*(b-a);
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const lerp = (a,b,t) => a+(b-a)*t;
function aabb(ax,ay,aw,ah,bx,by,bw,bh){ return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by; }

/* =========================================================================
   RUN LIFECYCLE
   ========================================================================= */
function startRun() {
  const cfg = DIFF[State.settings.difficulty];
  G.cfg = cfg;
  G.scene = 'playing';
  G.bird = { x:110, y:H/2, vy:0, r:15, rot:0, dashCd:0 };
  G.pipes = []; G.coins = []; G.powerups = []; G.particles = []; G.zones = []; G.trail = [];
  G.score = 0; G.runCoins = 0; G.combo = 0; G.comboTimer = 0; G.maxCombo = 0; G.mult = 1;
  G.scroll = cfg.scroll; G.distance = 0; G.spawnX = W + 40;
  G.shake = 0; G.timescale = 1; G.gravSign = 1; G.buffs = {}; G.usedPowerup = false;
  G.zoom = 1; G.zoomTarget = 1; G.deathTimer = 0; G.invuln = 0;
  G.ghostRec = []; G.ghostFrame = 0; G.ghostY = (State.ghost && State.ghost.length) ? State.ghost : null;
  gravity = 0.5; flapImpulse = -8.5;
  hideAllOverlays();
  Audio.resume(); Audio.startMusic();
  spawnPipe(); G.spawnX = W + 220;
}

function flap(strong) {
  if (G.scene !== 'playing') return;
  const imp = strong ? -11 : flapImpulse;
  G.bird.vy = imp * G.gravSign;
  Audio.sfx.flap();
  for (let i=0;i<4;i++) addParticle(G.bird.x-8, G.bird.y+8, skinById(State.equipped).trail, 1.2);
}

function tryDash() {
  if (!State.settings.doubleJump || G.scene !== 'playing' || G.bird.dashCd > 0) return;
  G.bird.dashCd = 1.5; flap(true);
  for (let i=0;i<10;i++) addParticle(G.bird.x-6, G.bird.y, '#9fdcff', 2);
}

/* ---------- spawning ---------- */
function spawnPipe() {
  const cfg = G.cfg;
  const margin = 70, gap = cfg.gap;
  const minGy = margin + gap/2, maxGy = H - 90 - margin - gap/2;
  let gy = rand(minGy, maxGy);
  // keep the gap center within reach of the previous pipe so the path is
  // always flyable, never a sudden top-to-bottom jump
  const prev = G.pipes[G.pipes.length-1];
  if (prev) gy = clamp(gy, clamp(prev.baseY - 150, minGy, maxGy), clamp(prev.baseY + 150, minGy, maxGy));
  const moving = (G.score >= cfg.moving);
  const pipe = {
    x: G.spawnX, gapY: gy, gap, w: 64,
    passed:false, scored:false,
    moving, baseY:gy, t:rand(0,Math.PI*2),
    amp: moving ? rand(28, 48) : 0,
    freq: rand(0.8, 1.4)
  };
  G.pipes.push(pipe);

  // coins: arc through the gap sometimes
  if (Math.random() < 0.8) {
    const n = 3 + (Math.random()*3|0);
    for (let i=0;i<n;i++) {
      G.coins.push({ x: pipe.x + pipe.w/2 + (i-(n-1)/2)*26, y: gy + Math.sin(i/n*Math.PI)* -22, r:9, got:false });
    }
  }
  // power-up: at most one per ~5 pipes
  if (G.score > 2 && Math.random() < 0.18) {
    G.powerups.push({ x: pipe.x + 160, y: rand(margin, H-130), type: PU_TYPES[Math.random()*PU_TYPES.length|0], t:0, got:false });
  }
  // gravity flip zone (insane)
  if (cfg.gravZones && G.score > 10 && Math.random() < 0.12) {
    G.zones.push({ x: pipe.x + 120, w: 90, used:false });
  }
}

/* ---------- particles ---------- */
function addParticle(x, y, color, scale=1) {
  G.particles.push({ x, y, vx:rand(-2.5,2.5)*scale, vy:rand(-3,1)*scale, life:1, color, r:rand(2,5)*scale });
}
function burst(x, y, color, n=8) { for (let i=0;i<n;i++) addParticle(x,y,color,1.4); }

/* ---------- buffs ---------- */
function applyBuff(type) {
  G.usedPowerup = true;
  Audio.sfx.power();
  burst(G.bird.x, G.bird.y, '#9fdcff', 12);
  if (type === 'shield') { G.buffs.shield = 1; toast('🛡️ Shield up!'); }
  else if (type === 'slow_mo') { G.buffs.slow_mo = 4; toast('🐌 Slow-mo!'); }
  else if (type === 'magnet') { G.buffs.magnet = 6; toast('🧲 Coin magnet!'); }
  else if (type === 'tiny') { G.buffs.tiny = 5; toast('🔻 Tiny mode!'); }
}

/* =========================================================================
   UPDATE
   ========================================================================= */
function update(dt) {
  if (G.scene === 'playing') updatePlaying(dt);
  else if (G.scene === 'dying') updateDying(dt);
  updateParticles(dt);
}

function updatePlaying(dt) {
  const b = G.bird;
  const slow = G.buffs.slow_mo ? 0.6 : 1;
  const ts = slow;

  // difficulty ramp
  G.scroll = G.cfg.scroll + Math.min(1.2, Math.floor(G.score/10)*0.15);
  const sp = G.scroll * ts;

  // gravity zones
  let inZone = false;
  for (const z of G.zones) { z.x -= sp; if (b.x > z.x && b.x < z.x + z.w) inZone = true; }
  G.gravSign = inZone ? -1 : 1;

  // physics
  b.dashCd = Math.max(0, b.dashCd - dt);
  if (G.invuln > 0) G.invuln -= dt;
  b.vy += gravity * G.gravSign * ts;
  b.vy = clamp(b.vy, -maxFall, maxFall);
  b.y += b.vy * ts;
  b.rot = clamp((b.vy/maxFall) * (Math.PI/2), -0.45, Math.PI/2) * G.gravSign;
  const rad = b.r * (G.buffs.tiny ? 0.6 : 1);

  // trail
  G.trail.push({ x:b.x, y:b.y }); if (G.trail.length > 14) G.trail.shift();

  // ghost record (y per frame)
  G.ghostRec.push(Math.round(b.y));

  // ground / ceiling
  if (b.y + rad > H - 90) {
    if (G.invuln > 0) { b.y = H - 90 - rad; b.vy = flapImpulse; }   // bounce while shielded
    else { b.y = H - 90 - rad; return die(); }
  }
  if (b.y - rad < 0) { b.y = rad; b.vy = 0; }

  // spawn pipes at a fixed horizontal spacing (so there's always a clear,
  // navigable gap between consecutive pipes — never a continuous wall)
  G.distance += sp;
  const SPACING = 240;                         // px between pipe centers
  const lastPipe = G.pipes[G.pipes.length-1];
  if (!lastPipe) { G.spawnX = W + 60; spawnPipe(); }
  else if (lastPipe.x <= W - SPACING + 60) { G.spawnX = lastPipe.x + SPACING; spawnPipe(); }

  // pipes
  for (const p of G.pipes) {
    p.x -= sp;
    if (p.moving) { p.t += dt * p.freq; p.gapY = p.baseY + Math.sin(p.t) * p.amp; }
    // scoring
    if (!p.scored && p.x + p.w < b.x) {
      p.scored = true;
      addScore(p);
    }
    // collision
    const half = p.gap/2;
    const topH = p.gapY - half, botY = p.gapY + half;
    if (aabb(b.x-rad, b.y-rad, rad*2, rad*2, p.x, 0, p.w, topH) ||
        aabb(b.x-rad, b.y-rad, rad*2, rad*2, p.x, botY, p.w, H-90-botY)) {
      if (G.invuln > 0) {
        // already shielded this hit — pass through harmlessly
      } else if (G.buffs.shield) {
        delete G.buffs.shield;
        G.invuln = 1.2;                                  // i-frames: absorb the whole hit, not one frame
        b.y = clamp(b.y, topH + rad + 2, botY - rad - 2); // recenter into the gap
        b.vy = flapImpulse * 0.5 * G.gravSign;            // gentle lift so you regain control
        burst(b.x, b.y, '#9fdcff', 16); G.shake = 8; Audio.sfx.power(); toast('🛡️ Shield saved you!');
      } else return die();
    }
  }
  G.pipes = G.pipes.filter(p => p.x + p.w > -20);

  // coins
  for (const c of G.coins) {
    c.x -= sp;
    if (G.buffs.magnet && !c.got) {
      const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx,dy);
      if (d < 130) { c.x += dx/d * 4; c.y += dy/d * 4; }
    }
    if (!c.got && Math.hypot(b.x-c.x, b.y-c.y) < rad + c.r) {
      c.got = true; G.runCoins++; Audio.sfx.coin(); burst(c.x, c.y, '#ffd23f', 7);
    }
  }
  G.coins = G.coins.filter(c => !c.got && c.x > -20);

  // power-ups
  for (const pu of G.powerups) {
    pu.x -= sp; pu.t += dt;
    if (!pu.got && Math.hypot(b.x-pu.x, b.y-(pu.y+Math.sin(pu.t*3)*6)) < rad + 16) {
      pu.got = true; applyBuff(pu.type);
    }
  }
  G.powerups = G.powerups.filter(pu => !pu.got && pu.x > -30);
  G.zones = G.zones.filter(z => z.x > -120);

  // buffs countdown
  for (const k in G.buffs) { if (k !== 'shield') { G.buffs[k] -= dt; if (G.buffs[k] <= 0) delete G.buffs[k]; } }

  // combo decay
  if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) { G.combo = 0; G.mult = 1; } }

  // ghost playback
  if (G.ghostY) { G.ghostFrame++; G.ghostY[G.ghostFrame]; }

  // music layers
  Audio.setLayers(G.score);
  // shake decay
  G.shake = Math.max(0, G.shake - dt*30);
}

function addScore(pipe) {
  // near-miss bonus combo
  const dist = Math.abs(G.bird.y - pipe.gapY);
  const near = dist > (pipe.gap/2 - G.bird.r - 18);
  G.combo += near ? 2 : 1;
  G.comboTimer = 2.5;
  G.mult = clamp(1 + Math.floor(G.combo/5), 1, 5);
  G.maxCombo = Math.max(G.maxCombo, G.mult);
  G.score += 1 * G.mult;
  Audio.sfx.score();
  if (near) toast('NEAR MISS! +combo');
  if (G.mult >= 5) unlock('combo_king');
}

function die() {
  if (G.scene !== 'playing') return;
  G.scene = 'dying'; G.deathTimer = 1.0;
  G.timescale = 0.2; G.zoomTarget = 1.8;
  G.shake = 14;
  Audio.sfx.crash();
  burst(G.bird.x, G.bird.y, skinById(State.equipped).body, 24);
  Audio.stopMusic();
}

function updateDying(dt) {
  G.zoom = lerp(G.zoom, G.zoomTarget, 0.12);
  G.bird.vy += gravity * 1.2 * G.timescale;
  G.bird.y += G.bird.vy * G.timescale;
  G.bird.rot += 0.1 * G.timescale;
  G.shake = Math.max(0, G.shake - dt*20);
  G.deathTimer -= dt;
  if (G.deathTimer <= 0) endRun();
}

function updateParticles(dt) {
  for (const p of G.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= dt*1.5; }
  G.particles = G.particles.filter(p => p.life > 0);
}

/* =========================================================================
   END RUN -> rewards, achievements, leaderboard, score card
   ========================================================================= */
function endRun() {
  G.scene = 'over';
  // coins
  State.coins += G.runCoins;
  State.lifetime += G.runCoins;
  // ghost: store best run
  const best = State.scores.length ? State.scores[0].score : 0;
  // achievements
  if (G.score >= 50) unlock('first_50');
  if (G.score >= 20 && !G.usedPowerup) unlock('purist');
  if (State.lifetime >= 1000) unlock('coin_millionaire');
  if (G.maxCombo >= 5) unlock('combo_king');
  // daily challenge
  checkDaily();
  // leaderboard
  const lowest = State.scores.length >= 10 ? State.scores[9].score : -1;
  const isHigh = G.score > 0 && (State.scores.length < 10 || G.score > lowest);
  save();
  renderScoreCard();
  if (isHigh) { promptInitials(); }
  else { showGameOver(); }
}

function commitScore(name) {
  State.scores.push({ name, score:G.score, date: todayKey() });
  State.scores.sort((a,b) => b.score - a.score);
  State.scores = State.scores.slice(0, 10);
  // store ghost of this run if it's the new best
  if (State.scores[0].score === G.score) State.ghost = G.ghostRec.slice(0, 4000);
  save();
}

/* =========================================================================
   ACHIEVEMENTS + DAILY + TOAST
   ========================================================================= */
function unlock(id) {
  if (State.achieve.includes(id)) return;
  State.achieve.push(id); save();
  const a = ACHIEVEMENTS.find(x => x.id === id);
  toast('🎖️ ' + (a ? a.name : id)); Audio.sfx.badge();
}
function checkCollector() {
  if (SKINS.every(s => State.unlocked.includes(s.id))) unlock('collector');
}
function dailyChallenge() {
  const key = todayKey();
  const list = [
    { txt:'Score 20 with no power-ups', test:() => G.score>=20 && !G.usedPowerup },
    { txt:'Collect 30 coins in one run', test:() => G.runCoins>=30 },
    { txt:'Reach a 3x combo',           test:() => G.maxCombo>=3 },
    { txt:'Score 30 in one run',        test:() => G.score>=30 }
  ];
  // stable index from date
  let h=0; for (const c of key) h = (h*31 + c.charCodeAt(0))|0;
  return { key, ...list[Math.abs(h)%list.length] };
}
function checkDaily() {
  const d = dailyChallenge();
  if (State.daily.dateKey !== d.key) State.daily = { dateKey:d.key, completed:false };
  if (!State.daily.completed && d.test()) {
    State.daily.completed = true; State.coins += 50; State.lifetime += 50;
    toast('✅ Daily done! +50 🪙'); Audio.sfx.badge(); save();
  }
}
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}
function todayKey() { const d = new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }

/* =========================================================================
   RENDER
   ========================================================================= */
function skyColors(score) {
  // day -> sunset -> night cycle every 10 pts
  const phases = [
    ['#4ec0ff','#bdebff'],  // day
    ['#ff9966','#ffd1a1'],  // sunset
    ['#0b1026','#243b75']   // night
  ];
  const t = (score % 30) / 10;        // 0..3
  const i = Math.floor(t) % 3, n = (i+1)%3, f = t - Math.floor(t);
  const mix = (a,b,f) => {
    const pa = a.match(/\w\w/g).map(h=>parseInt(h,16));
    const pb = b.match(/\w\w/g).map(h=>parseInt(h,16));
    return '#' + pa.map((v,k)=>Math.round(lerp(v,pb[k],f)).toString(16).padStart(2,'0')).join('');
  };
  return [ mix(phases[i][0].slice(1), phases[n][0].slice(1), f),
           mix(phases[i][1].slice(1), phases[n][1].slice(1), f),
           (score % 30) >= 20 ];   // isNight flag
}

function render() {
  ctx.save();
  // screen shake + death zoom
  const sx = (Math.random()-0.5) * G.shake, sy = (Math.random()-0.5) * G.shake;
  if (G.zoom !== 1) {
    ctx.translate(G.bird.x, G.bird.y);
    ctx.scale(G.zoom, G.zoom);
    ctx.translate(-G.bird.x, -G.bird.y);
  }
  ctx.translate(sx, sy);

  const [c1, c2, isNight] = skyColors(G.score);
  const grd = ctx.createLinearGradient(0,0,0,H);
  grd.addColorStop(0, c1); grd.addColorStop(1, c2);
  ctx.fillStyle = grd; ctx.fillRect(-30,-30,W+60,H+60);

  // stars at night
  if (isNight) {
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (let i=0;i<30;i++){ const x=(i*97%W), y=(i*53%(H-200)); ctx.fillRect(x, y, 2, 2); }
    ctx.fillStyle = 'rgba(255,255,230,.9)'; ctx.beginPath(); ctx.arc(W-70, 90, 26, 0, 7); ctx.fill();
  }

  // gravity zones
  for (const z of G.zones) {
    ctx.fillStyle = 'rgba(155,120,255,.18)';
    ctx.fillRect(z.x, 0, z.w, H-90);
    ctx.fillStyle = 'rgba(200,170,255,.9)'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign='center';
    ctx.fillText('⇅', z.x+z.w/2, 60); ctx.fillText('⇅', z.x+z.w/2, H-130);
  }

  // pipes
  for (const p of G.pipes) drawPipe(p);

  // ground
  ctx.fillStyle = isNight ? '#1c3a2a' : '#3ea66a';
  ctx.fillRect(-30, H-90, W+60, 120);
  ctx.fillStyle = isNight ? '#16302a' : '#2e8554';
  ctx.fillRect(-30, H-90, W+60, 12);

  // coins
  for (const c of G.coins) drawCoin(c.x, c.y, c.r);
  // power-ups
  for (const pu of G.powerups) {
    const yy = pu.y + Math.sin(pu.t*3)*6;
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(pu.x, yy, 17, 0, 7); ctx.fill();
    ctx.font = '20px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(PU_ICON[pu.type], pu.x, yy+1);
  }

  // ghost bird
  if (G.ghostY && G.ghostY[G.ghostFrame] != null && G.scene==='playing') {
    ctx.globalAlpha = 0.3; drawBird(G.bird.x, G.ghostY[G.ghostFrame], 0, true); ctx.globalAlpha = 1;
  }

  // trail
  const sk = skinById(State.equipped);
  for (let i=0;i<G.trail.length;i++){
    const t = G.trail[i], a = (i/G.trail.length);
    ctx.globalAlpha = a*0.5*Math.min(1, G.mult/3);
    ctx.fillStyle = sk.trail; ctx.beginPath(); ctx.arc(t.x, t.y, G.bird.r*a*0.8, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // bird
  if (G.scene !== 'over') drawBird(G.bird.x, G.bird.y, G.bird.rot, false);

  // particles
  for (const p of G.particles) {
    ctx.globalAlpha = clamp(p.life,0,1); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // HUD (not affected by shake/zoom)
  if (G.scene === 'playing' || G.scene === 'dying') drawHUD();
}

function drawPipe(p) {
  const half = p.gap/2, top = p.gapY - half, botY = p.gapY + half;
  const grad = ctx.createLinearGradient(p.x,0,p.x+p.w,0);
  grad.addColorStop(0,'#2fb14d'); grad.addColorStop(.5,'#5fe07f'); grad.addColorStop(1,'#239640');
  ctx.fillStyle = grad;
  ctx.fillRect(p.x, 0, p.w, top);
  ctx.fillRect(p.x, botY, p.w, H-90-botY);
  // lips
  ctx.fillStyle = '#239640';
  ctx.fillRect(p.x-4, top-18, p.w+8, 18);
  ctx.fillRect(p.x-4, botY, p.w+8, 18);
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(p.x+6, 0, 6, top);
}

function drawCoin(x,y,r) {
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle = '#ffce2e'; ctx.beginPath(); ctx.arc(0,0,r,0,7); ctx.fill();
  ctx.fillStyle = '#ffe98a'; ctx.beginPath(); ctx.arc(0,0,r*0.6,0,7); ctx.fill();
  ctx.fillStyle = '#b8860b'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('$', 0, 1);
  ctx.restore();
}

function drawBird(x, y, rot, ghost) {
  const sk = skinById(State.equipped);
  const scale = G.buffs.tiny ? 0.6 : 1;
  ctx.save(); ctx.translate(x,y); ctx.rotate(rot); ctx.scale(scale * (G.gravSign<0?1:1), scale * G.gravSign);
  // shield bubble (solid while held, flashing during the absorb i-frames)
  if (!ghost && (G.buffs.shield || G.invuln > 0)) {
    const flashing = !G.buffs.shield && G.invuln > 0;
    ctx.globalAlpha = flashing ? (0.4 + 0.4*Math.abs(Math.sin(Date.now()/90))) : 1;
    ctx.strokeStyle = 'rgba(120,200,255,.9)'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(0,0,22,0,7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // body
  ctx.fillStyle = sk.body; ctx.beginPath(); ctx.ellipse(0,0,16,13,0,0,7); ctx.fill();
  // wing
  ctx.fillStyle = sk.wing; ctx.beginPath(); ctx.ellipse(-3,2,8,5, Math.sin(Date.now()/80)*0.4, 0,7); ctx.fill();
  // belly
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(2,5,9,6,0,0,7); ctx.fill();
  // eye
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(8,-4,5,0,7); ctx.fill();
  ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(9,-4,2.4,0,7); ctx.fill();
  // beak
  ctx.fillStyle='#ff8c1a'; ctx.beginPath(); ctx.moveTo(14,-1); ctx.lineTo(24,2); ctx.lineTo(14,5); ctx.fill();
  ctx.restore();
}

function drawHUD() {
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  // score
  ctx.font = '900 56px -apple-system,sans-serif';
  ctx.lineWidth=6; ctx.strokeStyle='rgba(0,0,0,.4)'; ctx.fillStyle='#fff';
  ctx.strokeText(G.score, W/2, 80); ctx.fillText(G.score, W/2, 80);
  // combo
  if (G.mult > 1) {
    ctx.font='900 26px sans-serif'; ctx.fillStyle='#ffd23f';
    ctx.fillText(G.mult+'x  COMBO', W/2, 112);
  }
  // coins this run
  ctx.font='bold 20px sans-serif'; ctx.textAlign='left'; ctx.fillStyle='#fff';
  ctx.fillText('🪙 '+G.runCoins, 14, 36);
  // buff timers
  ctx.textAlign='right'; let by=36;
  for (const k in G.buffs) {
    const txt = G.buffs[k]===true ? PU_ICON[k] : PU_ICON[k]+' '+Math.ceil(G.buffs[k])+'s';
    ctx.fillText(txt, W-14, by); by+=26;
  }
}

/* =========================================================================
   SCORE CARD (shareable, branded)
   ========================================================================= */
let cardURL = null;
function renderScoreCard() {
  const c = document.createElement('canvas'); c.width = 600; c.height = 800;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0,0,0,800); g.addColorStop(0,'#1a1f3a'); g.addColorStop(1,'#0b1026');
  x.fillStyle=g; x.fillRect(0,0,600,800);
  // accent bar
  const g2 = x.createLinearGradient(0,0,600,0); g2.addColorStop(0,'#ffd23f'); g2.addColorStop(1,'#ff7b00');
  x.fillStyle=g2; x.fillRect(0,0,600,12); x.fillRect(0,788,600,12);
  x.textAlign='center';
  x.fillStyle='#ffd23f'; x.font='900 60px sans-serif'; x.fillText('FLAPPY RUSH', 300, 110);
  x.fillStyle='rgba(255,255,255,.6)'; x.font='bold 20px sans-serif'; x.fillText('SANTOS AUTOMATION', 300, 145);
  // big score
  x.fillStyle='#fff'; x.font='900 200px sans-serif'; x.fillText(G.score, 300, 380);
  x.fillStyle='rgba(255,255,255,.5)'; x.font='bold 24px sans-serif'; x.fillText('SCORE', 300, 420);
  // stats row
  const stat = (label, val, px) => {
    x.fillStyle='#ffd23f'; x.font='900 46px sans-serif'; x.fillText(val, px, 530);
    x.fillStyle='rgba(255,255,255,.55)'; x.font='bold 18px sans-serif'; x.fillText(label, px, 565);
  };
  stat('COINS', G.runCoins, 150);
  stat('MAX COMBO', G.maxCombo+'x', 300);
  stat('SKIN', '', 450);
  // draw bird preview on card
  const sk = skinById(State.equipped);
  x.save(); x.translate(450, 500); x.scale(1.4,1.4);
  x.fillStyle=sk.body; x.beginPath(); x.ellipse(0,0,16,13,0,0,7); x.fill();
  x.fillStyle=sk.wing; x.beginPath(); x.ellipse(-3,2,8,5,0,0,7); x.fill();
  x.fillStyle='#fff'; x.beginPath(); x.arc(8,-4,5,0,7); x.fill();
  x.fillStyle='#111'; x.beginPath(); x.arc(9,-4,2.4,0,7); x.fill();
  x.fillStyle='#ff8c1a'; x.beginPath(); x.moveTo(14,-1); x.lineTo(24,2); x.lineTo(14,5); x.fill();
  x.restore();
  x.fillStyle='rgba(255,255,255,.4)'; x.font='bold 16px sans-serif';
  x.fillText('Best: '+(State.scores[0]?State.scores[0].score:G.score)+'  •  '+todayKey(), 300, 660);
  x.fillStyle='#ffd23f'; x.font='900 30px sans-serif'; x.fillText('Can you beat me?', 300, 720);
  cardURL = c.toDataURL('image/png');
  document.getElementById('cardImg').src = cardURL;
}

/* =========================================================================
   MAIN LOOP
   ========================================================================= */
let last = performance.now();
function loop(now) {
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.05);
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* =========================================================================
   INPUT
   ========================================================================= */
let lastTap = 0;
function onTap(e) {
  if (G.scene !== 'playing') return;
  const now = performance.now();
  if (now - lastTap < 250 && State.settings.doubleJump) tryDash(); else flap(false);
  lastTap = now;
}
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); Audio.resume(); onTap(e); });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); Audio.resume(); if (G.scene==='playing') flap(false); else if (G.scene==='menu'||G.scene==='over') {} }
  if (e.code === 'ArrowUp') { if (G.scene==='playing') tryDash(); }
  if (e.key === 'r' || e.key === 'R') { if (G.scene==='over') startRun(); }
});

/* =========================================================================
   UI / SCREENS
   ========================================================================= */
const $ = id => document.getElementById(id);
const overlays = ['menu','over','hs','shop','lb','ach','settings'];
function hideAllOverlays() { overlays.forEach(o => $(o).classList.remove('show')); }
function showOverlay(id) { hideAllOverlays(); $(id).classList.add('show'); }

function refreshMenu() {
  $('menuCoins').textContent = State.coins;
  const d = dailyChallenge();
  if (State.daily.dateKey !== d.key) State.daily = { dateKey:d.key, completed:false };
  $('daily').innerHTML = '🎯 <b>Daily:</b> ' + d.txt + (State.daily.completed ? ' ✅ (+50)' : ' • +50 🪙');
  // segments reflect saved settings
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('active', b.dataset.mode===State.settings.mode));
  document.querySelectorAll('#diffSeg button').forEach(b => b.classList.toggle('active', b.dataset.diff===State.settings.difficulty));
}

$('btnPlay').onclick = () => { Audio.resume(); startRun(); };
$('btnRetry').onclick = () => startRun();
$('btnMenu').onclick = () => { G.scene='menu'; showOverlay('menu'); refreshMenu(); };

document.querySelectorAll('#modeSeg button').forEach(b => b.onclick = () => {
  State.settings.mode = b.dataset.mode; save(); refreshMenu();
});
document.querySelectorAll('#diffSeg button').forEach(b => b.onclick = () => {
  State.settings.difficulty = b.dataset.diff; save(); refreshMenu();
});

/* ---- Shop ---- */
$('btnShop').onclick = () => { renderShop(); showOverlay('shop'); };
$('shopBack').onclick = () => { showOverlay('menu'); refreshMenu(); };
function renderShop() {
  $('shopCoins').textContent = State.coins;
  const grid = $('skinGrid'); grid.innerHTML = '';
  SKINS.forEach(sk => {
    const owned = State.unlocked.includes(sk.id);
    const equipped = State.equipped === sk.id;
    const div = document.createElement('div');
    div.className = 'skincard' + (equipped?' equipped':'') + (owned?'':' locked');
    const cv = document.createElement('canvas'); cv.width=48; cv.height=48;
    const xc = cv.getContext('2d'); xc.translate(24,24);
    xc.fillStyle=sk.body; xc.beginPath(); xc.ellipse(0,0,15,12,0,0,7); xc.fill();
    xc.fillStyle=sk.wing; xc.beginPath(); xc.ellipse(-3,2,7,4,0,0,7); xc.fill();
    xc.fillStyle='#fff'; xc.beginPath(); xc.arc(7,-4,4,0,7); xc.fill();
    xc.fillStyle='#111'; xc.beginPath(); xc.arc(8,-4,2,0,7); xc.fill();
    xc.fillStyle='#ff8c1a'; xc.beginPath(); xc.moveTo(13,-1); xc.lineTo(22,2); xc.lineTo(13,4); xc.fill();
    div.appendChild(cv);
    const nm = document.createElement('div'); nm.className='nm'; nm.textContent = sk.name; div.appendChild(nm);
    const ct = document.createElement('div'); ct.className='ct';
    ct.textContent = equipped ? '✓ Equipped' : owned ? 'Owned' : '🪙 '+sk.cost;
    div.appendChild(ct);
    div.onclick = () => {
      if (owned) { State.equipped = sk.id; save(); renderShop(); toast('Equipped '+sk.name); }
      else if (State.coins >= sk.cost) {
        State.coins -= sk.cost; State.unlocked.push(sk.id); State.equipped = sk.id;
        save(); checkCollector(); renderShop(); toast('Unlocked '+sk.name+'!'); Audio.sfx.power();
      } else toast('Not enough coins');
    };
    grid.appendChild(div);
  });
}

/* ---- Leaderboard ---- */
$('btnLb').onclick = () => { renderLB(); showOverlay('lb'); };
$('lbBack').onclick = () => { showOverlay('menu'); refreshMenu(); };
function renderLB() {
  const el = $('lbList');
  if (!State.scores.length) { el.innerHTML = '<div class="e">No scores yet — go fly!</div>'; return; }
  el.innerHTML = State.scores.map((s,i) =>
    `<div class="e"><span>${String(i+1).padStart(2,'0')}. ${s.name}</span><span>${s.score}</span></div>`).join('');
}

/* ---- Achievements ---- */
$('btnAch').onclick = () => { renderAch(); showOverlay('ach'); };
$('achBack').onclick = () => { showOverlay('menu'); refreshMenu(); };
function renderAch() {
  $('achList').innerHTML = ACHIEVEMENTS.map(a => {
    const got = State.achieve.includes(a.id);
    return `<div class="toggle"><span><b>${got?'🎖️':'🔒'} ${a.name}</b><br><span style="opacity:.6;font-size:12px">${a.desc}</span></span><span>${got?'✓':''}</span></div>`;
  }).join('');
}

/* ---- Settings ---- */
$('btnSettings').onclick = () => { renderSettings(); showOverlay('settings'); };
$('setBack').onclick = () => { showOverlay('menu'); refreshMenu(); };
function renderSettings() {
  document.querySelectorAll('.switch').forEach(sw => {
    sw.classList.toggle('on', !!State.settings[sw.dataset.s]);
  });
}
document.querySelectorAll('.switch').forEach(sw => sw.onclick = () => {
  const k = sw.dataset.s; State.settings[k] = !State.settings[k]; save(); renderSettings();
  if (k==='music' && !State.settings.music) Audio.stopMusic();
});
$('resetData').onclick = () => {
  if (confirm('Erase all coins, skins, scores and badges?')) {
    ['fr_total_coins','fr_high_scores','fr_unlocked_skins','fr_equipped_skin','fr_achievements','fr_best_ghost','fr_settings','fr_daily','fr_lifetime_coins'].forEach(k=>localStorage.removeItem(k));
    location.reload();
  }
};

/* ---- Game over ---- */
function showGameOver() {
  $('overScore').textContent = G.score;
  $('overBest').textContent = 'Best: ' + (State.scores[0] ? State.scores[0].score : G.score);
  $('overCoins').textContent = G.runCoins;
  $('overCombo').textContent = G.maxCombo + 'x';
  showOverlay('over');
}
$('btnShare').onclick = () => {
  if (!cardURL) return;
  // Try native share, fall back to download
  if (navigator.canShare) {
    fetch(cardURL).then(r=>r.blob()).then(b=>{
      const file = new File([b],'flappy-rush.png',{type:'image/png'});
      if (navigator.canShare({files:[file]})) navigator.share({files:[file], title:'Flappy Rush', text:'I scored '+G.score+' on Flappy Rush!'});
      else downloadCard();
    }).catch(downloadCard);
  } else downloadCard();
};
function downloadCard() {
  const a = document.createElement('a'); a.href = cardURL; a.download = 'flappy-rush-'+G.score+'.png'; a.click();
}

/* ---- Share to Facebook ---- */
const GAME_URL = 'https://flappy-rush.vercel.app/';
$('btnFb').onclick = async () => {
  const msg = `I scored ${G.score} on Flappy Rush! 🐤 Can you beat me?`;
  // Best path on phones: share the actual score-card image straight into the Facebook app
  try {
    if (navigator.canShare && cardURL) {
      const blob = await (await fetch(cardURL)).blob();
      const file = new File([blob], 'flappy-rush-'+G.score+'.png', { type:'image/png' });
      if (navigator.canShare({ files:[file] })) {
        await navigator.share({ files:[file], title:'Flappy Rush', text: msg });
        return;
      }
    }
  } catch (e) { /* user cancelled or unsupported — fall through to web sharer */ }
  // Fallback (desktop): open the Facebook share dialog for the game link
  const url = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(GAME_URL)
            + '&quote=' + encodeURIComponent(msg);
  window.open(url, 'fbshare', 'width=620,height=520,menubar=no,toolbar=no');
};

/* ---- High-score initials entry (arcade style) ---- */
let initials = ['A','A','A'], selIdx = 0;
const hsInput = $('hsInput');
function promptInitials() {
  initials = ['A','A','A']; selIdx = 0;
  $('hsScore').textContent = G.score;
  hsInput.value = '';
  renderInitials(); showOverlay('hs');
  // focus after the overlay is visible so phones raise the keyboard
  setTimeout(() => { try { hsInput.focus(); } catch {} }, 80);
}
function renderInitials() {
  $('initials').innerHTML = initials.map((c,i)=>`<div class="c${i===selIdx?' sel':''}">${c}</div>`).join('');
}
function syncFromInput() {
  const v = hsInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0,3);
  if (hsInput.value !== v) hsInput.value = v;
  initials = [v[0]||'A', v[1]||'A', v[2]||'A'];
  selIdx = Math.min(2, v.length);   // highlight the next box to fill
  renderInitials();
}
hsInput.addEventListener('input', syncFromInput);
// tapping the boxes (or anywhere in the wrap) re-opens the mobile keyboard
$('initials').parentElement.addEventListener('pointerdown', (e) => { e.preventDefault(); hsInput.focus(); });
// keep Enter-to-submit for physical keyboards (letters/backspace handled natively by the input)
window.addEventListener('keydown', (e) => {
  if (!$('hs').classList.contains('show')) return;
  if (e.key === 'Enter') { e.preventDefault(); $('hsOk').click(); }
});
$('hsDel').onclick = () => { hsInput.value = hsInput.value.slice(0, -1); syncFromInput(); hsInput.focus(); };
$('hsOk').onclick = () => { hsInput.blur(); commitScore(initials.join('')); showGameOver(); };

/* ---------- boot ---------- */
refreshMenu();
console.log('%cFLAPPY RUSH','color:#ffd23f;font-weight:900;font-size:20px','— Santos Automation');
})();
