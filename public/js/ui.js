// ---------------------------------------------------------------------
// Small UI toolkit: formatting, icons, charts, toasts, modals.
// Everything that inserts text into HTML goes through esc().
// ---------------------------------------------------------------------
import { TERM_LABELS, classRank } from './import/util.js';
export { TERM_LABELS, classRank };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const nf = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ₦12,345 (kobo shown only when the amount has them). */
export const money = (n) => {
  const v = Number(n) || 0;
  return (v < 0 ? '−' : '') + '₦' + (Math.abs(v % 1) > 0.004 ? nf2.format(Math.abs(v)) : nf.format(Math.abs(v)));
};
/** ₦1.2M style for tight spaces. */
export const moneyShort = (n) => {
  const v = Math.abs(Number(n) || 0), s = (Number(n) || 0) < 0 ? '−' : '';
  if (v >= 1e6) return `${s}₦${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (v >= 1e3) return `${s}₦${Math.round(v / 1e3)}k`;
  return `${s}₦${Math.round(v)}`;
};
export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
export const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y) return esc(iso);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
};
export const termLabel = (t) => TERM_LABELS[t] || `Term ${t}`;

export const STATUS = {
  paid: 'Fully paid', part: 'Part-paid', unpaid: 'Not paid', over: 'Overpaid', nofee: 'No fee'
};
export const badge = (st) => `<span class="badge ${esc(st)}">${esc(STATUS[st] || st)}</span>`;

// ------------------------------- icons -------------------------------
const P = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3"/><path d="M16 7l3 3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M17.9 17.9A10.9 10.9 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M1 1l22 22"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>'
};
export const icon = (name, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;

// ------------------------------- widgets -------------------------------
export const statCard = (label, value, { sub = '', tone = '' } = {}) =>
  `<div class="card stat ${tone}"><div class="k">${esc(label)}</div><div class="v">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;

/** Horizontal bars: rows = [{label, value, max?, display, tone}] */
export function bars(rows, { max } = {}) {
  const top = max || Math.max(1, ...rows.map((r) => r.max || r.value));
  return `<div class="bars">${rows.map((r) => `
    <div class="bar-row"><span title="${esc(r.label)}">${esc(r.label)}</span>
      <div class="bar-track" role="img" aria-label="${esc(r.label)}: ${esc(r.display)}"><div class="bar-fill ${r.tone || ''}" style="width:${Math.max(0, Math.min(100, ((r.value) / (r.max || top)) * 100)).toFixed(1)}%"></div></div>
      <b class="num">${esc(r.display)}</b></div>`).join('')}</div>`;
}

/** Stacked horizontal status bar from counts {paid,part,unpaid,over}. */
export function statusBar(counts) {
  const items = [['paid', 'Fully paid', 'var(--ok)'], ['part', 'Part-paid', 'var(--chart-5)'], ['unpaid', 'Not paid', 'var(--bad)'], ['over', 'Overpaid', 'var(--info)']];
  const total = items.reduce((s, [k]) => s + (counts[k] || 0), 0) || 1;
  return `<div style="display:flex;height:14px;border-radius:999px;overflow:hidden;background:var(--line)" role="img" aria-label="Payment status split">
      ${items.map(([k, , c]) => (counts[k] ? `<i style="width:${(counts[k] / total) * 100}%;background:${c}"></i>` : '')).join('')}</div>
    <div class="legend">${items.map(([k, l, c]) => `<span><i style="background:${c}"></i>${l}: <b class="num">${counts[k] || 0}</b></span>`).join('')}</div>`;
}

/** Simple responsive column chart. series=[{label, value}] */
export function columnChart(series, { height = 180, format = moneyShort, color = 'var(--chart-1)', color2 = 'var(--line-strong)', pairs = false } = {}) {
  const W = 560, H = height, padL = 8, padB = 28, padT = 14;
  const max = Math.max(1, ...series.map((s) => Math.max(s.value, s.value2 || 0)));
  const n = series.length, slot = (W - padL * 2) / Math.max(n, 1), bw = Math.min(pairs ? 22 : 38, slot * (pairs ? .34 : .6));
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const lines = [0, .5, 1].map((f) => `<line class="grid-line" x1="0" x2="${W}" y1="${y(max * f)}" y2="${y(max * f)}"/>`).join('');
  const cols = series.map((s, i) => {
    const cx = padL + slot * i + slot / 2;
    const a = pairs ? cx - bw - 1 : cx - bw / 2;
    return `${pairs ? `<rect x="${cx + 1}" y="${y(s.value2 || 0)}" width="${bw}" height="${H - padB - y(s.value2 || 0)}" rx="4" fill="${color2}"><title>${esc(s.label)} · ${esc(s.name2 || '')}: ${esc(format(s.value2 || 0))}</title></rect>` : ''}
      <rect x="${a}" y="${y(s.value)}" width="${bw}" height="${Math.max(0, H - padB - y(s.value))}" rx="4" fill="${color}"><title>${esc(s.label)}: ${esc(format(s.value))}</title></rect>
      <text x="${cx}" y="${H - 9}" text-anchor="middle">${esc(s.label)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart">${lines}${cols}</svg>`;
}

export const empty = (title, text = '', ic = 'inbox') =>
  `<div class="empty">${icon(ic, '')}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
export const skeleton = (n = 3) => `<div class="stack" aria-busy="true" aria-label="Loading">${Array.from({ length: n }, () => '<div class="sk sk-card"></div>').join('')}</div>`;

// ------------------------------- feedback -------------------------------
let toastHost;
export function toast(message, type = '') {
  if (!toastHost) { toastHost = document.createElement('div'); toastHost.className = 'toasts'; toastHost.setAttribute('role', 'status'); toastHost.setAttribute('aria-live', 'polite'); document.body.appendChild(toastHost); }
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = message; toastHost.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

/** Accessible modal / bottom sheet. Returns { close, el }. */
export function openModal({ title, subtitle = '', body = '', onClose } = {}) {
  const prev = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-head"><div><h2>${esc(title)}</h2>${subtitle ? `<div class="muted small">${subtitle}</div>` : ''}</div>
    <button class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="sheet-body">${body}</div></div>`;
  document.body.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  const close = () => { wrap.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); prev && prev.focus && prev.focus(); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  setTimeout(() => (wrap.querySelector('[data-close]') || wrap).focus(), 30);
  return { close, el: wrap };
}

export async function withLoading(btn, fn) {
  btn.classList.add('is-loading'); btn.disabled = true;
  try { return await fn(); } finally { btn.classList.remove('is-loading'); btn.disabled = false; }
}

export const debounce = (fn, ms = 180) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied', 'ok'); } catch (e) { toast('Copy is not available here — select and copy it manually.'); }
}

/** Download rows as CSV. Cells that start with = + - @ are neutralised so spreadsheets never run them as formulas. */
export function downloadCsv(filename, header, rows) {
  const cell = (v) => { let s = String(v ?? ''); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const sortByClass = (a, b) => classRank(a.ck || a.classKey) - classRank(b.ck || b.classKey) || String(a.n || a.name).localeCompare(String(b.n || b.name));
export const sessionsDesc = (list) => [...new Set(list)].sort().reverse();

/** Copies each header's text onto its column's cells so phones can show "Label: value" cards. */
export function labelCells(root = document) {
  root.querySelectorAll('table.t.cards').forEach((tb) => {
    const heads = [...tb.querySelectorAll('thead th')].map((h) => h.textContent.trim());
    tb.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => { if (!td.dataset.l && heads[i]) td.dataset.l = heads[i]; }));
  });
}
