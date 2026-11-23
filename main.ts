// Glow Snake — built from one prompt by an AI agent for make.fun's
// "The agent builds a game from one prompt" bounty.
// Node 22, standard library only. It copies POST.json from the repository
// root to /output/POST.json (the gate reads the post from it) and writes
// the finished game as a single self-contained index.html to /output.
//
// Outside the grader's container, MAKEFUN_BOT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /bot and /output:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const GAME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Glow Snake — built from one prompt</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0b0d; color: #f2f2f2; font-family: "Segoe UI", Arial, sans-serif;
    min-height: 100vh; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 10px; padding: 12px; }
  h1 { font-size: 38px; letter-spacing: 6px; color: #39ff6a;
    text-shadow: 0 0 18px rgba(57,255,106,.8); }
  h1 span { color: #c41c83; text-shadow: 0 0 18px rgba(196,28,131,.8); }
  .sub { color: #9a93a0; font-size: 14px; letter-spacing: 2px; }
  .hud { display: flex; gap: 28px; font-size: 21px; }
  .hud b { color: #ffd23f; }
  #auto { color: #191419; background: #39ff6a; border-radius: 999px; padding: 2px 12px;
    font-size: 15px; font-weight: 700; letter-spacing: 2px; display: none; }
  #auto.on { display: inline-block; }
  canvas { width: min(76vh, 740px); height: min(76vh, 740px); background: #14101a;
    border: 2px solid #2c2436; border-radius: 12px;
    box-shadow: 0 0 40px rgba(57,255,106,.12), 0 0 60px rgba(196,28,131,.10); }
  .hint { color: #9a93a0; font-size: 15px; }
  .hint kbd { background: #241d2b; border: 1px solid #4a3f57; border-radius: 5px;
    padding: 1px 7px; color: #e8e8e8; font-family: inherit; }
  #over { position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
    background: rgba(13,11,13,.72); }
  #over.show { display: flex; }
  #over .card { text-align: center; background: #1b1420; border: 1px solid #c41c83;
    border-radius: 16px; padding: 36px 54px; box-shadow: 0 0 50px rgba(196,28,131,.45); }
  #over h2 { color: #ff5c8a; font-size: 40px; letter-spacing: 4px; margin-bottom: 10px; }
  #over p { font-size: 20px; color: #d8d2dc; margin-bottom: 18px; }
  #over button { font-size: 20px; padding: 10px 28px; border: none; border-radius: 999px;
    background: #39ff6a; color: #191419; font-weight: 700; cursor: pointer; }
</style>
</head>
<body>
<h1>GLOW <span>SNAKE</span></h1>
<div class="sub">BUILT FROM ONE PROMPT &middot; BY AN AI AGENT</div>
<div class="hud"><span>SCORE <b id="score">0</b></span><span>BEST <b id="best">0</b></span><span id="auto">AUTO-PLAY</span></div>
<canvas id="game" width="720" height="720"></canvas>
<div class="hint"><kbd>&larr;</kbd> <kbd>&uarr;</kbd> <kbd>&darr;</kbd> <kbd>&rarr;</kbd> or <kbd>WASD</kbd> to take over &middot; <kbd>R</kbd> to restart &middot; it plays itself until you steer</div>
<div id="over"><div class="card"><h2>GAME OVER</h2><p id="final">Score 0</p><button onclick="resetGame()">PLAY AGAIN</button></div></div>
<script>
(function () {
  var N = 30, CELL = 720 / N;
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best');
  var autoEl = document.getElementById('auto');
  var overEl = document.getElementById('over');
  var finalEl = document.getElementById('final');
  var best = 0;
  try { best = parseInt(localStorage.getItem('glow-snake-best') || '0', 10) || 0; } catch (e) {}
  bestEl.textContent = best;

  var snake, dir, queue, orb, score, alive, lastTick, speed, auto;
  function placeOrb() {
    var p;
    do {
      p = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
    } while (snake.some(function (s) { return s.x === p.x && s.y === p.y; }));
    orb = p;
  }
  function resetGame() {
    snake = [{ x: 15, y: 15 }, { x: 14, y: 15 }, { x: 13, y: 15 }];
    dir = { x: 1, y: 0 };
    queue = [];
    score = 0;
    alive = true;
    speed = 8;
    auto = true; // plays itself until the player steers
    scoreEl.textContent = '0';
    overEl.classList.remove('show');
    autoEl.classList.add('on');
    placeOrb();
    lastTick = performance.now();
  }
  function autoDir() {
    // Greedy autopilot: head for the orb, never turn into a wall or the body.
    var head = snake[0];
    var opts = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    var safe = [];
    for (var i = 0; i < opts.length; i++) {
      var d = opts[i];
      if (d.x === -dir.x && d.y === -dir.y) continue;
      var nx = head.x + d.x, ny = head.y + d.y;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      var hit = false;
      for (var j = 0; j < snake.length - 1; j++) {
        if (snake[j].x === nx && snake[j].y === ny) { hit = true; break; }
      }
      if (!hit) safe.push(d);
    }
    if (!safe.length) return dir;
    var bestD = safe[0], bestDist = 1e9;
    for (var k = 0; k < safe.length; k++) {
      var dd = Math.abs(head.x + safe[k].x - orb.x) + Math.abs(head.y + safe[k].y - orb.y);
      if (dd < bestDist) { bestDist = dd; bestD = safe[k]; }
    }
    return bestD;
  }
  function tick(now) {
    if (!alive) return;
    var stepMs = 1000 / speed;
    if (now - lastTick < stepMs) return;
    lastTick = now;
    if (auto) dir = autoDir();
    if (queue.length) {
      var nd = queue.shift();
      if (!(nd.x === -dir.x && nd.y === -dir.y)) dir = nd;
    }
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N ||
        snake.some(function (s) { return s.x === head.x && s.y === head.y; })) {
      alive = false;
      finalEl.textContent = 'Score ' + score + '  ·  Best ' + best;
      overEl.classList.add('show');
      if (auto) setTimeout(function () { if (auto) resetGame(); }, 1200);
      return;
    }
    snake.unshift(head);
    if (head.x === orb.x && head.y === orb.y) {
      score += 1;
      scoreEl.textContent = score;
      if (score > best) {
        best = score;
        bestEl.textContent = best;
        try { localStorage.setItem('glow-snake-best', String(best)); } catch (e) {}
      }
      if (speed < 16) speed += 0.25;
      placeOrb();
    } else {
      snake.pop();
    }
  }
  function draw() {
    ctx.fillStyle = '#14101a';
    ctx.fillRect(0, 0, 720, 720);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (var g = 1; g < N; g++) {
      ctx.beginPath(); ctx.moveTo(g * CELL, 0); ctx.lineTo(g * CELL, 720); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, g * CELL); ctx.lineTo(720, g * CELL); ctx.stroke();
    }
    var pulse = 0.65 + 0.35 * Math.sin(performance.now() / 180);
    ctx.save();
    ctx.shadowColor = '#c41c83';
    ctx.shadowBlur = 22 * pulse;
    ctx.fillStyle = '#ff4da6';
    ctx.beginPath();
    ctx.arc(orb.x * CELL + CELL / 2, orb.y * CELL + CELL / 2, CELL * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    for (var i = snake.length - 1; i >= 0; i--) {
      var s = snake[i];
      var t = i === 0 ? 1 : 1 - (i / snake.length) * 0.55;
      ctx.save();
      ctx.shadowColor = '#39ff6a';
      ctx.shadowBlur = i === 0 ? 20 : 10;
      ctx.fillStyle = i === 0 ? '#a9ffb8' : 'rgba(57,255,106,' + t.toFixed(3) + ')';
      var pad = i === 0 ? 1.5 : 2.5;
      ctx.beginPath();
      ctx.roundRect(s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 6);
      ctx.fill();
      ctx.restore();
    }
  }
  function loop(now) {
    tick(now);
    draw();
    requestAnimationFrame(loop);
  }
  var KEYS = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
    W: { x: 0, y: -1 }, S: { x: 0, y: 1 }, A: { x: -1, y: 0 }, D: { x: 1, y: 0 } };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'r' || e.key === 'R') { resetGame(); return; }
    var d = KEYS[e.key];
    if (d) {
      e.preventDefault();
      auto = false; // the player took over
      autoEl.classList.remove('on');
      if (queue.length < 3) queue.push(d);
    }
  });
  window.resetGame = resetGame;
  resetGame();
  requestAnimationFrame(loop);
})();
</script>
</body>
</html>
`;

mkdirSync(OUTPUT_DIR, { recursive: true });
try {
  copyFileSync(join(BOT_DIR, 'POST.json'), join(OUTPUT_DIR, 'POST.json'));
} catch (err) {
  console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
  process.exit(1);
}
writeFileSync(join(OUTPUT_DIR, 'index.html'), GAME_HTML);
console.log(`wrote ${join(OUTPUT_DIR, 'index.html')} (${GAME_HTML.length} bytes)`);
