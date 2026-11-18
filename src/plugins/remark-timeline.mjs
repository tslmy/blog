// Renders a ```timeline fenced block (YAML) as a swimlane "ownership timeline".
// Written as a code block so it survives the Obsidian sync untouched.
// Interactivity is CSS-only (radio inputs + :has), so no client script is needed.
//
// ```timeline
// start: 2014          # first year on the axis (default: earliest date)
// items:
//   - name: City Backpack
//     maker: Herschel
//     img: ![[Pasted image 20261023203844.png]]   # Obsidian embed: the sync copies the image too
//     dates: ~2015 → 2019                     # optional; derived from spans otherwise
//     spans:                                  # kind: carried (default) | borrowed | afterlife
//       - { from: ~2015, to: 2019-06 }
//       - { from: 2019-06, to: now, kind: afterlife, label: lives on with a friend }
//     events:
//       - { at: 2016-05, label: Simply Orange vs. MacBook Air }
//     quote: The bag was so watertight that…
//     status: Passed on
// ```
import { visit } from 'unist-util-visit';
import { parse } from 'yaml';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Minimal inline markup: *em* and **strong**.
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');

const now = new Date();
const NOW = now.getFullYear() + (now.getMonth() + (now.getDate() - 1) / 31) / 12;

// "2026-07-01" | "2026-07" | 2025 | 2025.5 | "~2015" | "now" → fractional year
function toYear(v) {
  if (v instanceof Date) return v.getUTCFullYear() + (v.getUTCMonth() + (v.getUTCDate() - 1) / 31) / 12;
  const s = String(v).trim().replace(/^~/, '');
  if (s === 'now') return NOW;
  const m = s.match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
  if (m) return +m[1] + ((m[2] ? +m[2] - 1 : 0) + (m[3] ? (+m[3] - 1) / 31 : 0)) / 12;
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  throw new Error(`timeline: can't read date "${v}"`);
}
function fmt(v) {
  if (v instanceof Date) v = v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(~?)(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!m) return s;
  return `${m[1]}${MONTHS[+m[3] - 1]}${m[4] ? ` ${+m[4]},` : ''} ${m[2]}`;
}
// Image refs: "![[photo.png]]" (Obsidian embed, as written in the note), "![](/vault-assets/…)" (after
// `pnpm sync` rewrote the embed and copied the file), a bare vault filename, or a plain URL/path.
function asset(p) {
  if (!p) return '';
  p = String(p).trim();
  const md = p.match(/^!\[[^\]]*\]\(([^)\s]+)\)$/);
  if (md) return md[1];
  const wiki = p.match(/^!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]$/);
  if (wiki) p = wiki[1].split('/').pop();
  return /^(\/|https?:)/.test(p) ? p : `/vault-assets/${encodeURIComponent(p)}`;
}
// Image embeds start with "!", which YAML reads as a tag; quote them so they can be written bare.
const quoteEmbeds = (src) => src.replace(/^(\s*(?:-\s+)?[\w-]+:\s*)(!\[.*?)\s*$/gm, (m, k, v) => `${k}${JSON.stringify(v)}`);

let counter = 0;

function render(src) {
  const cfg = parse(quoteEmbeds(src)) ?? {};
  const items = (cfg.items ?? []).map((it) => ({
    ...it,
    spans: (it.spans ?? []).map((s) => ({ ...s, kind: s.kind ?? 'carried', a: toYear(s.from), b: toYear(s.to ?? 'now') })),
    events: (it.events ?? []).map((e) => ({ ...e, t: toYear(e.at) })),
  }));
  const all = items.flatMap((it) => it.spans.flatMap((s) => [s.a, s.b]));
  const A = cfg.start != null ? toYear(cfg.start) : Math.floor(Math.min(...all));
  const B = Math.max(NOW, ...all) + 0.35;
  const pct = (t) => (((Math.min(Math.max(t, A), B) - A) / (B - A)) * 100).toFixed(2) + '%';
  const wid = (a, b) => (((Math.min(b, B) - Math.max(a, A)) / (B - A)) * 100).toFixed(2) + '%';
  const id = `tl-${++counter}`;
  const sel = Math.max(0, items.findIndex((it) => it.selected));

  const ticks = [];
  for (let y = Math.ceil(A); y < B - 0.3; y++) ticks.push(y);

  const lanes = items
    .map((it, i) => {
      const main = it.spans.find((s) => s.kind === 'carried') ?? it.spans[0];
      const first = it.spans[0];
      const last = it.spans.filter((s) => s.kind !== 'afterlife').at(-1) ?? first;
      const dates = it.dates ?? (first ? `${fmt(first.from)} → ${fmt(last.to ?? 'now')}` : '');
      const bars = it.spans
        .map((s) => {
          if (s.kind === 'afterlife')
            return `<span class="tl-after" style="left:${pct(s.a)};width:${wid(s.a, s.b)}"></span>${
              s.label ? `<span class="tl-lbl tl-lbl-below" style="left:calc(${pct(s.a)} + .5rem)">${esc(s.label)}</span>` : ''
            }`;
          const fuzzy = s.a < A ? ' tl-fuzzy' : '';
          const lbl = s.label ? `<span class="tl-lbl" style="left:${pct(s.a)}">${esc(s.label)}</span>` : '';
          return `<span class="tl-bar tl-${esc(s.kind)}${fuzzy}" style="left:${pct(s.a)};width:${wid(s.a, s.b)}"></span>${lbl}`;
        })
        .join('');
      // Date label sits above the main span; flips to its left when the span starts near the right edge.
      const lateStart = main && (main.a - A) / (B - A) > 0.7;
      const dateLbl =
        dates && !it.spans.some((s) => s.kind !== 'afterlife' && s.label)
          ? `<span class="tl-lbl${lateStart ? ' tl-lbl-flip' : ''}" style="left:${pct(main.a)}">${esc(dates)}</span>`
          : '';
      const evs = it.events
        .filter((e) => e.t >= A)
        .map((e) => `<span class="tl-ev" style="left:${pct(e.t)}" data-l="${esc(e.label)}"></span>`)
        .join('');
      const img = it.img
        ? `<img src="${esc(asset(it.img))}" alt="" loading="lazy"${it.focus ? ` style="object-position:${esc(it.focus)}"` : ''}>`
        : '<span class="tl-noimg">?</span>';
      return `<label class="tl-lane" for="${id}-${i}" data-i="${i}">
  <span class="tl-who">${img}<span><span class="tl-name">${inline(it.name)}</span><span class="tl-maker">${esc(it.maker ?? '')}</span></span></span>
  <span class="tl-track">${bars}${dateLbl}${evs}</span>
</label>`;
    })
    .join('\n');

  const stories = items
    .map((it, i) => {
      const first = it.spans[0];
      const last = it.spans.filter((s) => s.kind !== 'afterlife').at(-1) ?? first;
      const dates = it.dates ?? (first ? `${fmt(first.from)} → ${fmt(last.to ?? 'now')}` : '');
      const list = [...it.events.map((e) => e.label), ...it.spans.filter((s) => s.kind === 'afterlife' && s.label).map((s) => s.label)];
      return `<div class="tl-story" data-i="${i}">
  ${it.img ? `<img src="${esc(asset(it.img))}" alt="${esc(it.name)}" loading="lazy"${it.focus ? ` style="object-position:${esc(it.focus)}"` : ''}>` : ''}
  <div>
    <div class="tl-story-title">${it.maker ? `${esc(it.maker)} ` : ''}${inline(it.name)}</div>
    <div class="tl-story-meta">${esc(dates)}${it.status ? ` · ${esc(it.status)}` : ''}</div>
    ${it.quote ? `<blockquote>${inline(it.quote)}</blockquote>` : ''}
    ${list.length ? `<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>` : ''}
  </div>
</div>`;
    })
    .join('\n');

  const rules = items
    .map(
      (_, i) =>
        `#${id}:has(#${id}-${i}:checked) [data-i="${i}"]{--on:1}` +
        `#${id}:has(#${id}-${i}:checked) .tl-story[data-i="${i}"]{display:grid}` +
        `#${id}:has(#${id}-${i}:focus-visible) .tl-lane[data-i="${i}"]{outline:2px solid var(--accent);outline-offset:-2px}`,
    )
    .join('');

  const kinds = new Set(items.flatMap((it) => it.spans.map((s) => s.kind)));
  const legend = [
    `<span><i class="tl-key-bar"></i>carried</span>`,
    kinds.has('borrowed') && `<span><i class="tl-key-bar tl-borrowed"></i>borrowed</span>`,
    kinds.has('afterlife') && `<span><i class="tl-key-after"></i>afterlife</span>`,
    items.some((it) => it.events.length) && `<span><i class="tl-key-ev"></i>incident (hover)</span>`,
  ]
    .filter(Boolean)
    .join('');

  return `<figure class="timeline" id="${id}">
<style>${rules}</style>
${items.map((_, i) => `<input type="radio" class="tl-radio" name="${id}" id="${id}-${i}"${i === sel ? ' checked' : ''} aria-label="${esc(items[i].name)}">`).join('')}
<div class="tl-scroll"><div class="tl-inner">
<div class="tl-grid">${ticks.map((y) => `<span style="left:${pct(y)}"></span>`).join('')}<span class="tl-now" style="left:${pct(NOW)}"></span></div>
<div class="tl-axis"><span></span><span class="tl-track">${ticks.map((y) => `<span style="left:${pct(y)}">${y}</span>`).join('')}</span></div>
${lanes}
</div></div>
<div class="tl-legend">${legend}</div>
${stories}
${cfg.caption ? `<figcaption>${inline(cfg.caption)}</figcaption>` : ''}
</figure>`;
}

export default function remarkTimeline() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'timeline' || !parent) return;
      parent.children[index] = { type: 'html', value: render(node.value) };
    });
  };
}
