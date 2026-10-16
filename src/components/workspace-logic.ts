import type { FileItem } from './editor-data';

export function lineStartOf(text: string, index: number) {
 return index <= 0 ? 0 : text.lastIndexOf('\n', index - 1) + 1;
}

const CLOSERS: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
const VOID_TAG = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;

/**
 * Dipanggil setelah teks berubah (bukan dari keydown, karena keyboard Android sering kirim key "Unidentified").
 * Kalau yang baru diketik 1 karakter Enter -> sisipkan indent; kalau 1 karakter penutup } ) ] di baris kosong -> outdent.
 * null = tidak ada yang perlu diubah.
 */
export function smartIndent(old: string, value: string, pos: number, language = ''): { value: string; caret: number } | null {
 if (pos < 1 || value.length !== old.length + 1 || value.slice(0, pos - 1) + value.slice(pos) !== old) return null;
 const unit = language === 'Python' ? '    ' : '  ';
 const typed = value[pos - 1];
 const before = value.slice(0, pos - 1);
 const after = value.slice(pos);
 const lineStart = lineStartOf(before, before.length);
 const line = before.slice(lineStart);
 if (typed === '\n') {
  const indent = line.match(/^[ \t]*/)?.[0] ?? '';
  const trimmed = line.trimEnd();
  const last = trimmed.slice(-1);
  const tag = trimmed.match(/<([a-zA-Z][\w-]*)(?:\s[^<>]*)?>$/);
  const opensTag = !!tag && !VOID_TAG.test(tag[1]) && !trimmed.endsWith('/>');
  const opens = last in CLOSERS || opensTag || (language === 'Python' && last === ':');
  const closesNext = (last in CLOSERS && after[0] === CLOSERS[last]) || (opensTag && after.startsWith('</'));
  if (opens && closesNext) {
   const head = before + '\n' + indent + unit;
   return { value: head + '\n' + indent + after, caret: head.length };
  }
  const ins = '\n' + indent + (opens ? unit : '');
  return { value: before + ins + after, caret: before.length + ins.length };
 }
 if ('}])'.includes(typed) && /^[ \t]+$/.test(line) && line.endsWith(unit)) {
  const head = before.slice(0, lineStart) + line.slice(0, line.length - unit.length) + typed;
  return { value: head + after, caret: head.length };
 }
 return null;
}

// Jembatan console iframe -> parent (dipasang paling awal di <head>).
const BRIDGE = '<script>(function(){function s(k,a){try{parent.postMessage({src:"kode-preview",k:k,t:Array.prototype.map.call(a,function(x){try{return typeof x==="string"?x:JSON.stringify(x)}catch(e){return String(x)}}).join(" ")},"*")}catch(e){}}'
 + '["log","info","warn","error"].forEach(function(m){var o=console[m];console[m]=function(){s(m==="error"||m==="warn"?"err":"out",arguments);o.apply(console,arguments)}});'
 + 'window.addEventListener("error",function(e){s("err",[e.message])});'
 + 'window.addEventListener("unhandledrejection",function(e){s("err",["Unhandled: "+e.reason])});})();</script>';

const clean = (path: string) => path.replace(/^\.?\//, '');
const esc = (code: string) => code.replace(/<\/(script|style)/gi, '<\\/$1');

/** Gabungkan index.html + CSS/JS lokal jadi satu dokumen untuk iframe. null = tidak ada file HTML. */
export function buildPreview(list: FileItem[]): string | null {
 const page = list.find(f => f.name === 'index.html') ?? list.find(f => f.language === 'HTML');
 if (!page) return null;
 const byName = new Map(list.map(f => [f.name, f.content]));
 const html = page.content
  .replace(/<link\b[^>]*>/gi, tag => {
   if (!/rel=["']?stylesheet/i.test(tag)) return tag;
   const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
   const css = href ? byName.get(clean(href)) : undefined;
   return css === undefined ? tag : `<style>${esc(css)}</style>`;
  })
  .replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src: string) => {
   const js = byName.get(clean(src));
   return js === undefined ? tag : `<script type="module">${esc(js)}</script>`;
  });
 return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + BRIDGE) : BRIDGE + html;
}

/** Jalankan JS di Web Worker (tanpa akses DOM/halaman). Berhenti otomatis setelah 1,5 dtk tanpa output. */
export function runInWorker(code: string, emit: (kind: 'out' | 'err', text: string) => void) {
 const body = code.replace(/^\s*export\s+default\s+/gm, '').replace(/^\s*export\s+/gm, '');
 const src = [
  "const send=(k,a)=>postMessage({k,t:a.map(x=>{try{return typeof x==='string'?x:JSON.stringify(x)}catch(e){return String(x)}}).join(' ')});",
  "console.log=console.info=(...a)=>send('out',a);",
  "console.warn=console.error=(...a)=>send('err',a);",
  "self.addEventListener('unhandledrejection',e=>send('err',['Unhandled: '+e.reason]));",
  'try{\n' + body + '\n}catch(e){send("err",[String(e)])}',
 ].join('\n');
 let worker: Worker | undefined;
 let url = '';
 let timer: ReturnType<typeof setTimeout> | undefined;
 let count = 0;
 let ended = false;
 const finish = () => {
  if (ended) return;
  ended = true;
  clearTimeout(timer);
  worker?.terminate();
  if (url) URL.revokeObjectURL(url);
 };
 const bump = () => { clearTimeout(timer); timer = setTimeout(finish, 1500); };
 try {
  url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  worker = new Worker(url);
 } catch (err) {
  emit('err', `Worker tidak tersedia: ${String(err)}`);
  finish();
  return;
 }
 worker.onmessage = (ev: MessageEvent) => {
  const d = ev.data as { k?: 'out' | 'err'; t?: string };
  if (d?.k !== 'out' && d?.k !== 'err') return;
  if (++count > 200) { emit('err', '(output dipotong: lebih dari 200 baris)'); finish(); return; }
  emit(d.k, d.t ?? '');
  bump();
 };
 worker.onerror = (ev: ErrorEvent) => { ev.preventDefault(); emit('err', ev.message || 'Error'); finish(); };
 bump();
}
