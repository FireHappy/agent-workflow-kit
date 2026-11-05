'use strict';

/* ================================================================
 * 网页闹钟 — 纯前端单页应用
 * 功能：设置闹钟 / 当前时间与倒计时 / 到点提醒(弹窗+闪烁+蜂鸣) /
 *       闹钟列表(增删开关) / localStorage 持久化
 * ================================================================ */

const STORAGE_KEY = 'web-alarm-clock.alarms.v1';
const GRACE_MS = 5 * 60 * 1000; // 到点后的宽限期：页面后台节流/短暂刷新仍可正常响铃
const TICK_MS = 500;            // 时钟刷新周期

/* ---------------- 状态 ---------------- */
let alarms = [];        // {id, enabled, time:"HH:MM", label, lastRungKey}
let ringingIds = [];    // 正在响铃的闹钟 id
let beepTimer = null;
let titleTimer = null;
let audioCtx = null;
let audioUnlocked = false;

/* ---------------- DOM ---------------- */
const $ = (sel) => document.querySelector(sel);
const clockDisplay = $('#clockDisplay');
const clockSub = $('#clockSub');
const countdownEl = $('#countdown');
const countdownDetail = $('#countdownDetail');
const alarmForm = $('#alarmForm');
const hourInput = $('#hourInput');
const minuteInput = $('#minuteInput');
const labelInput = $('#labelInput');
const formError = $('#formError');
const alarmList = $('#alarmList');
const alarmCount = $('#alarmCount');
const emptyHint = $('#emptyHint');
const ringModal = $('#ringModal');
const ringList = $('#ringList');
const testRingBtn = $('#testRingBtn');

/* ---------------- 工具函数 ---------------- */
const pad2 = (n) => String(n).padStart(2, '0');

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function parseTime(t) {
  const [h, m] = t.split(':').map(Number);
  return { h, m };
}

/* 闹钟在 now 之后的下一次触发时间（today 已过则明天） */
function nextOccurrence(alarm, now) {
  const { h, m } = parseTime(alarm.time);
  const d = new Date(now.getTime());
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

/* 毫秒差 → "HH:MM:SS"（上限 99 小时） */
function formatHMS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/* ---------------- 持久化 ---------------- */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    alarms = Array.isArray(parsed) ? parsed.filter(isValidAlarm) : [];
  } catch (e) {
    console.warn('读取 localStorage 失败，使用空列表', e);
    alarms = [];
  }
}

function isValidAlarm(a) {
  return a && typeof a.id === 'string' && typeof a.enabled === 'boolean' &&
    /^\d{2}:\d{2}$/.test(a.time) && typeof a.label === 'string';
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alarms));
  } catch (e) {
    console.warn('写入 localStorage 失败（可能为隐私模式/配额）', e);
  }
}

/* ---------------- 音频（Web Audio 蜂鸣） ---------------- */
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/* 首次点击/按键时解锁音频（浏览器自动播放策略要求用户手势） */
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  ensureAudio();
}
document.addEventListener('pointerdown', unlockAudio, { once: false });
document.addEventListener('keydown', unlockAudio, { once: false });

/* 一声双音"嘀-嘟"，约 0.4s */
function beepOnce() {
  const ctx = ensureAudio();
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = [
    { freq: 880, start: 0, dur: 0.16 },
    { freq: 1174.66, start: 0.22, dur: 0.2 },
  ];
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = n.freq;
    gain.gain.setValueAtTime(0.0001, t + n.start);
    gain.gain.exponentialRampToValueAtTime(0.45, t + n.start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + n.start + n.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + n.start);
    osc.stop(t + n.start + n.dur + 0.05);
  }
}

function startBeep() {
  stopBeep();
  beepOnce();
  beepTimer = setInterval(beepOnce, 750);
}

function stopBeep() {
  if (beepTimer) { clearInterval(beepTimer); beepTimer = null; }
}

/* ---------------- 标题闪烁 ---------------- */
function startTitleFlash() {
  stopTitleFlash();
  let on = false;
  titleTimer = setInterval(() => {
    on = !on;
    document.title = on ? '⏰ 闹钟响铃中！' : '🔔 网页闹钟';
  }, 700);
}

function stopTitleFlash() {
  if (titleTimer) { clearInterval(titleTimer); titleTimer = null; }
  document.title = '网页闹钟';
}

/* ---------------- 到点提醒 ---------------- */
/*
 * dueItems: [{id, time, label, key}]  —— key 为本次触发时刻的时间戳，用于去重
 * opts.test: 测试响铃模式（不自动停用闹钟）
 */
function ring(dueItems, opts = {}) {
  const ids = dueItems.map((i) => i.id);

  if (!opts.test) {
    // 记录已响铃 + 自动停用（一次性闹钟语义）
    let changed = false;
    for (const i of dueItems) {
      const alarm = alarms.find((a) => a.id === i.id);
      if (!alarm) continue;
      if (alarm.lastRungKey !== i.key) { alarm.lastRungKey = i.key; changed = true; }
      if (alarm.enabled) { alarm.enabled = false; changed = true; }
    }
    if (changed) { save(); renderList(); }
  }

  ringingIds = Array.from(new Set([...ringingIds, ...ids]));

  // 弹窗内容
  ringList.innerHTML = '';
  for (const i of dueItems) {
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="ring-time">${escapeHtml(i.time)}</span>` +
      (i.label ? ` · <span class="ring-note">${escapeHtml(i.label)}</span>` : '');
    ringList.appendChild(li);
  }
  ringModal.hidden = false;

  // 页面闪烁 + 标题闪烁 + 蜂鸣
  document.body.classList.add('ringing');
  startTitleFlash();
  startBeep();
}

function stopRing() {
  ringingIds = [];
  stopBeep();
  stopTitleFlash();
  document.body.classList.remove('ringing');
  ringModal.hidden = true;
}

$('#stopRingBtn').addEventListener('click', stopRing);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !ringModal.hidden) stopRing();
});

/* 测试响铃：模拟 3 秒提醒（不影响真实闹钟状态） */
testRingBtn.addEventListener('click', () => {
  const now = new Date();
  const fake = {
    id: 'test-' + uid(),
    time: pad2(now.getHours()) + ':' + pad2(now.getMinutes()),
    label: '这是测试响铃',
    key: now.getTime(),
  };
  ring([fake], { test: true });
  setTimeout(stopRing, 3000);
});

/* ---------------- 时钟 & 倒计时 & 响铃检测 ---------------- */
function updateClock(now) {
  clockDisplay.textContent =
    `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  clockSub.textContent =
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} 星期${week}`;
}

function updateCountdown(now) {
  const enabled = alarms.filter((a) => a.enabled);

  if (ringingIds.length > 0) {
    countdownEl.textContent = '响铃中！';
    countdownDetail.textContent = '点击“停止响铃”或按 Esc 关闭';
    return;
  }
  if (!enabled.length) {
    countdownEl.textContent = '--:--:--';
    countdownDetail.textContent = '未设置启用的闹钟';
    return;
  }

  let nearest = null;
  for (const a of enabled) {
    const occ = nextOccurrence(a, now);
    if (!nearest || occ.getTime() < nearest.occ.getTime()) nearest = { alarm: a, occ };
  }

  countdownEl.textContent = formatHMS(nearest.occ.getTime() - now.getTime());
  const target =
    `${pad2(nearest.occ.getHours())}:${pad2(nearest.occ.getMinutes())}:00`;
  countdownDetail.textContent =
    `将于 ${target} 响铃` + (nearest.alarm.label ? ` · ${nearest.alarm.label}` : '');
}

/* 检查是否有闹钟到点（含宽限期去重） */
function checkDue(now) {
  const nowMs = now.getTime();
  const due = [];
  for (const a of alarms) {
    if (!a.enabled) continue;
    const occ = nextOccurrence(a, now);                 // 未来的触发时刻
    const prevMs = occ.getTime() - 24 * 60 * 60 * 1000; // 本次窗口对应的触发时刻（今天或昨天的同一时刻）
    if (nowMs >= prevMs && nowMs - prevMs < GRACE_MS && a.lastRungKey !== prevMs) {
      due.push({ id: a.id, time: a.time, label: a.label, key: prevMs });
    }
  }
  if (due.length) ring(due);
}

function tick() {
  const now = new Date();
  updateClock(now);
  checkDue(now);
  updateCountdown(now);
}

/* ---------------- 闹钟列表 ---------------- */
function renderList() {
  alarmList.innerHTML = '';
  for (const a of alarms) {
    const li = document.createElement('li');
    li.className = 'alarm-item' + (a.enabled ? '' : ' disabled');

    const main = document.createElement('div');
    main.className = 'alarm-main';
    const timeSpan = document.createElement('span');
    timeSpan.className = 'alarm-time';
    timeSpan.textContent = a.time;
    const noteSpan = document.createElement('span');
    noteSpan.className = 'alarm-note';
    noteSpan.textContent = a.label || '无标签';
    main.append(timeSpan, noteSpan);

    const actions = document.createElement('div');
    actions.className = 'alarm-actions';

    const label = document.createElement('label');
    label.className = 'switch';
    label.title = a.enabled ? '点击停用' : '点击启用';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = a.enabled;
    toggle.dataset.action = 'toggle';
    toggle.dataset.id = a.id;
    const slider = document.createElement('span');
    slider.className = 'slider';
    label.append(toggle, slider);

    const status = document.createElement('span');
    status.className = 'status-text' + (a.enabled ? ' on' : '');
    status.textContent = a.enabled ? '启用' : '停用';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-danger';
    del.textContent = '删除';
    del.dataset.action = 'delete';
    del.dataset.id = a.id;

    actions.append(label, status, del);
    li.append(main, actions);
    alarmList.appendChild(li);
  }

  alarmCount.textContent = alarms.length;
  emptyHint.hidden = alarms.length > 0;
}

/* 事件代理：开关 / 删除 */
alarmList.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.action !== 'toggle') return;
  const alarm = alarms.find((a) => a.id === t.dataset.id);
  if (!alarm) return;
  alarm.enabled = t.checked;
  // 注意：重新启用时保留 lastRungKey，避免在同一次触发窗口（宽限期）内立刻再次响铃；
  // 下一天的同一时刻 key 不同，仍会正常响铃。
  save();
  renderList();
  updateCountdown(new Date());
});

alarmList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="delete"]');
  if (!btn) return;
  const id = btn.dataset.id;
  alarms = alarms.filter((a) => a.id !== id);
  ringingIds = ringingIds.filter((rid) => rid !== id);
  save();
  renderList();
  updateCountdown(new Date());
});

/* ---------------- 添加闹钟 ---------------- */
alarmForm.addEventListener('submit', (e) => {
  e.preventDefault();
  formError.hidden = true;

  const h = Number(hourInput.value);
  const m = Number(minuteInput.value);
  const label = labelInput.value.trim();

  let msg = '';
  if (!Number.isInteger(h) || h < 0 || h > 23) msg = '小时需为 0–23 的整数';
  else if (!Number.isInteger(m) || m < 0 || m > 59) msg = '分钟需为 0–59 的整数';

  if (msg) {
    formError.textContent = msg;
    formError.hidden = false;
    return;
  }

  alarms.push({
    id: uid(),
    enabled: true,
    time: `${pad2(h)}:${pad2(m)}`,
    label,
    lastRungKey: null,
  });
  save();
  renderList();
  updateCountdown(new Date());

  labelInput.value = '';
  formError.textContent = '';
  formError.hidden = true;
});

/* ---------------- 启动 ---------------- */
load();
renderList();
tick();
setInterval(tick, TICK_MS);