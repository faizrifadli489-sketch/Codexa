import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Bell, Braces, Check, ChevronDown, ChevronRight, ChevronsLeftRight, Code2, Download, Ellipsis, FilePlus2, Files, Folder, GitBranch, Keyboard, PanelLeftClose, Pencil, Play, Plus, Puzzle, RefreshCw, Search, Settings2, Sparkles, Terminal, Trash2, Undo2, X, CircleAlert, CircleX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { files, fileMeta, languages, plugins, type FileItem } from './editor-data';
import { buildPreview, lineStartOf, runInWorker, smartIndent } from './workspace-logic';

type View = 'editor' | 'files' | 'search' | 'plugins' | 'settings' | 'preview';
type TermLine = { kind: 'in' | 'out' | 'err'; text: string };
const STORAGE_KEY = 'kode:files:v1';
const INITIAL_TERM: TermLine[] = [{ kind: 'out', text: 'kode shell · ketik "help" untuk daftar perintah' }];
const SHORTCUTS: [label: string, text: string, back: number][] = [['{ }', '{}', 1], ['( )', '()', 1], ['[ ]', '[]', 1], [';', ';', 0], ['"', '""', 1], ['/', '/', 0]];
const HELP = 'help · ls · cat <file> · touch <file> · rm <file> · mv <a> <b> · echo <teks> · open <file> · node <file.js> · pwd · date · clear';

function IconButton({ children, label, onClick, className = '' }: { children: ReactNode; label: string; onClick?: () => void; className?: string }) {
 return <Button variant="ghost" size="icon" title={label} aria-label={label} onClick={onClick} className={className}>{children}</Button>;
}
function highlighted(line: string) {
 const parts = line.split(/(<!--.*?-->|\/\/.*$|"[^"]*"|'[^']*'|`[^`]*`|<\/?[\w-]+|\b(?:const|function|return|export|default|from|import|def|if|print)\b|\b[\w-]+(?==)|\b\d+\b)/g);
 return parts.map((part, i) => {
  const type = /^(<!--|\/\/)/.test(part) ? 'comment' : /^["'`]/.test(part) ? 'string' : /^<\/?/.test(part) ? 'tag' : /^(const|function|return|export|default|from|import|def|if|print)$/.test(part) ? 'keyword' : /^\d+$/.test(part) ? 'number' : /^[\w-]+$/.test(part) ? 'attribute' : '';
  return <span key={i} className={type ? `syntax-${type}` : undefined}>{part}</span>;
 });
}
export function CodeWorkspace() {
 const [view, setView] = useState<View>('editor');
 const [fileList, setFileList] = useState<FileItem[]>(files);
 const [openNames, setOpenNames] = useState<string[]>(files.slice(0, 3).map(f => f.name));
 const [activeName, setActiveName] = useState(files[0]?.name ?? '');
 const [dirty, setDirty] = useState<Set<string>>(new Set());
 const [cursor, setCursor] = useState({ ln: 1, col: 1 });
 const [naming, setNaming] = useState<{ mode: 'new' } | { mode: 'rename'; from: string } | null>(null);
 const [draft, setDraft] = useState('');
 const [confirmDel, setConfirmDel] = useState<string | null>(null);
 const [terminalOpen, setTerminalOpen] = useState(true);
 const [terminalTab, setTerminalTab] = useState('Terminal');
 const [term, setTerm] = useState<TermLine[]>(INITIAL_TERM);
 const [logs, setLogs] = useState<string[]>([]);
 const [problems, setProblems] = useState<string[]>([]);
 const [previewKey, setPreviewKey] = useState(0);
 const [sidebar, setSidebar] = useState(true);
 const [query, setQuery] = useState('');
 const [language, setLanguage] = useState('HTML');
 const [autoIndent, setAutoIndent] = useState(true);
 const [wrap, setWrap] = useState(false);
 const [installed, setInstalled] = useState(plugins.filter(p => p.installed).map(p => p.name));
 const [notice, setNotice] = useState('');
 const [command, setCommand] = useState('');
 const taRef = useRef<HTMLTextAreaElement>(null);
 const frameRef = useRef<HTMLIFrameElement>(null);
 const termRef = useRef<HTMLDivElement>(null);
 const pendingSel = useRef<[number, number] | null>(null);
 const history = useRef<Record<string, [string, number][]>>({});
 const cmdHistory = useRef<string[]>([]);
 const cmdIndex = useRef(0);
 const activeFile = fileList.find(f => f.name === activeName);
 const indentUnit = activeFile?.language === 'Python' ? '    ' : '  ';
 const previewDoc = useMemo(() => (view === 'preview' ? buildPreview(fileList) : ''), [view, fileList, previewKey]);

 // Muat file tersimpan (setelah mount supaya SSR tidak mismatch)
 useEffect(() => {
  try {
   const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
   if (Array.isArray(parsed) && parsed.every(f => typeof f?.name === 'string' && typeof f?.content === 'string')) {
    const list: FileItem[] = parsed.map(f => ({ name: f.name, content: f.content, ...fileMeta(f.name) }));
    setFileList(list); setOpenNames(list.slice(0, 3).map(f => f.name)); setActiveName(list[0]?.name ?? '');
    if (list[0]) setLanguage(list[0].language);
   }
  } catch { /* data rusak: pakai contoh */ }
 }, []);
 // Pesan console dari iframe preview
 useEffect(() => {
  const onMessage = (e: MessageEvent) => {
   const d = e.data as { src?: string; k?: string; t?: string } | null;
   if (d?.src !== 'kode-preview' || e.source !== frameRef.current?.contentWindow) return;
   const text = String(d.t ?? '');
   setLogs(l => [...l, (d.k === 'err' ? '✖ ' : '') + text].slice(-200));
   if (d.k === 'err') setProblems(p => [...p, text]);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
 }, []);
 // Shortcut global
 useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
   if (!(e.ctrlKey || e.metaKey)) return;
   if (e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
   else if (e.key.toLowerCase() === 'k') { e.preventDefault(); setQuery(''); setView('search'); }
   else if (e.key === '`') { e.preventDefault(); setTerminalOpen(o => !o); }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
 });
 useLayoutEffect(() => {
  const sel = pendingSel.current; const el = taRef.current;
  if (sel && el) { el.setSelectionRange(sel[0], sel[1]); pendingSel.current = null; updateCursor(el); }
 });
 useEffect(() => { const el = termRef.current; if (el) el.scrollTop = el.scrollHeight; }, [term, logs, problems, terminalTab]);

 function persist(list: FileItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* storage penuh/diblokir */ }
  setDirty(new Set());
 }
 function save() { persist(fileList); setNotice('Tersimpan di browser.'); }
 function updateCursor(el: HTMLTextAreaElement) {
  const pos = el.selectionStart;
  const ln = el.value.slice(0, pos).split('\n').length; const col = pos - lineStartOf(el.value, pos) + 1;
  setCursor(c => (c.ln === ln && c.col === col ? c : { ln, col }));
 }
 function setContent(value: string, caretBefore?: number) {
  if (!activeFile) return;
  const stack = (history.current[activeName] ??= []);
  stack.push([activeFile.content, caretBefore ?? Math.max(0, (taRef.current?.selectionStart ?? 0) - (value.length - activeFile.content.length))]);
  if (stack.length > 200) stack.shift();
  setFileList(l => l.map(f => (f.name === activeName ? { ...f, content: value } : f)));
  setDirty(d => (d.has(activeName) ? d : new Set(d).add(activeName)));
 }
 function edit(value: string, start: number, end = start) {
  setContent(value, taRef.current?.selectionStart);
  pendingSel.current = [start, end];
 }
 function insertAtCursor(text: string, back = 0) {
  const el = taRef.current; if (!el || !activeFile) return;
  const s = el.selectionStart; const e = el.selectionEnd; const v = activeFile.content;
  edit(v.slice(0, s) + text + v.slice(e), s + text.length - back);
  el.focus();
 }
 function undo() {
  const prev = history.current[activeName]?.pop();
  if (!prev) { setNotice('Tidak ada yang bisa di-undo.'); return; }
  setFileList(l => l.map(f => (f.name === activeName ? { ...f, content: prev[0] } : f)));
  setDirty(d => new Set(d).add(activeName));
  pendingSel.current = [prev[1], prev[1]];
  taRef.current?.focus();
 }
 function moveLine(dir: -1 | 1) {
  const el = taRef.current; if (!el) return;
  const v = el.value; const s = el.selectionStart; const ls = lineStartOf(v, s); const col = s - ls;
  let target: number;
  if (dir < 0) {
   if (ls === 0) return;
   const pls = lineStartOf(v, ls - 1); target = pls + Math.min(col, ls - 1 - pls);
  } else {
   const le = v.indexOf('\n', s); if (le === -1) return;
   const nle = v.indexOf('\n', le + 1); const end = nle === -1 ? v.length : nle;
   target = le + 1 + Math.min(col, end - (le + 1));
  }
  el.focus(); el.setSelectionRange(target, target); updateCursor(el);
 }
 function onEditorChange(e: ChangeEvent<HTMLTextAreaElement>) {
  const value = e.target.value; const pos = e.target.selectionStart;
  const res = autoIndent && activeFile ? smartIndent(activeFile.content, value, pos, activeFile.language) : null;
  if (!res) { setContent(value); return; }
  setContent(res.value, pos - 1);
  pendingSel.current = [res.caret, res.caret];
 }
 function onEditorKey(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const el = e.currentTarget; const v = el.value; const s = el.selectionStart; const en = el.selectionEnd;
  if (!e.shiftKey) { edit(v.slice(0, s) + indentUnit + v.slice(en), s + indentUnit.length); return; }
  const ls = lineStartOf(v, s); const n = v.slice(ls).match(new RegExp(`^ {1,${indentUnit.length}}`))?.[0].length ?? 0;
  if (n) edit(v.slice(0, ls) + v.slice(ls + n), Math.max(ls, s - n), Math.max(ls, en - n));
 }

 // ---- File manager ----
 function validName(name: string, ignore?: string) {
  if (!name) return 'Nama file kosong.';
  if (/[\\/]/.test(name)) return 'Nama tidak boleh mengandung / atau \\.';
  if (name.length > 60) return 'Nama terlalu panjang (maks 60).';
  if (name !== ignore && fileList.some(f => f.name === name)) return `${name} sudah ada.`;
  return '';
 }
 function openFile(file: FileItem) {
  setActiveName(file.name); setLanguage(file.language); setView('editor'); setConfirmDel(null);
  setOpenNames(n => (n.includes(file.name) ? n : [...n, file.name]));
 }
 function closeFile(name: string) {
  const remaining = openNames.filter(n => n !== name);
  setOpenNames(remaining);
  if (activeName === name) {
   const next = remaining[remaining.length - 1] ?? ''; setActiveName(next);
   const f = fileList.find(x => x.name === next); if (f) setLanguage(f.language);
  }
 }
 function createFile(raw: string, open = true) {
  const name = raw.trim(); const err = validName(name); if (err) return err;
  const file: FileItem = { name, ...fileMeta(name), content: '' };
  const next = [...fileList, file]; setFileList(next); persist(next);
  if (open) openFile(file);
  return '';
 }
 function removeFile(name: string) {
  if (!fileList.some(f => f.name === name)) return `${name}: tidak ada file.`;
  const next = fileList.filter(f => f.name !== name); setFileList(next); persist(next);
  closeFile(name); delete history.current[name];
  return '';
 }
 function renameFile(from: string, raw: string) {
  if (!fileList.some(f => f.name === from)) return `${from}: tidak ada file.`;
  const name = raw.trim(); const err = validName(name, from); if (err) return err;
  const meta = fileMeta(name);
  const next = fileList.map(f => (f.name === from ? { ...f, name, ...meta } : f)); setFileList(next); persist(next);
  setOpenNames(o => o.map(n => (n === from ? name : n)));
  if (activeName === from) { setActiveName(name); setLanguage(meta.language); }
  if (history.current[from]) { history.current[name] = history.current[from]; delete history.current[from]; }
  return '';
 }
 function submitName() {
  if (!naming) return;
  const err = naming.mode === 'new' ? createFile(draft) : renameFile(naming.from, draft);
  if (err) setNotice(err); else { setNaming(null); setDraft(''); }
 }
 function askDelete(name: string) {
  if (confirmDel !== name) { setConfirmDel(name); setNotice(`Tap ikon hapus sekali lagi untuk menghapus ${name}.`); return; }
  const err = removeFile(name); setConfirmDel(null); setNotice(err || `${name} dihapus.`);
 }
 const nameForm = <form className="flex items-center gap-1 px-3 py-1" onSubmit={e => { e.preventDefault(); submitName(); }}><input autoFocus className="panel-search" style={{ marginBottom: 0, height: 32 }} placeholder="nama-file.ext" aria-label="Nama file" enterKeyHint="done" autoCapitalize="off" autoCorrect="off" autoComplete="off" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setNaming(null); }} /><IconButton label="Simpan nama" onClick={submitName}><Check size={14} /></IconButton><IconButton label="Batal" onClick={() => setNaming(null)}><X size={14} /></IconButton></form>;
 const fileRows = (list: FileItem[]) => <>
  {naming?.mode === 'new' && nameForm}
  {list.map(file => naming?.mode === 'rename' && naming.from === file.name ? <div key={file.name}>{nameForm}</div> : <div key={file.name} className="flex items-center">
   <Button variant="ghost" className={`file-row ${file.name === activeName ? 'selected' : ''}`} style={{ flex: 1, minWidth: 0, width: 'auto' }} onClick={() => openFile(file)}><span className={`file-badge ${file.type}`}>{file.badge}</span>{file.name}{dirty.has(file.name) && <span className="tree-note">M</span>}</Button>
   <IconButton label={`Rename ${file.name}`} className="h-7 w-7 shrink-0" onClick={() => { setNaming({ mode: 'rename', from: file.name }); setDraft(file.name); }}><Pencil size={13} /></IconButton>
   <IconButton label={`Delete ${file.name}`} className={`h-7 w-7 shrink-0 ${confirmDel === file.name ? 'text-destructive' : ''}`} onClick={() => askDelete(file.name)}><Trash2 size={13} /></IconButton>
  </div>)}
 </>;
 const startNew = () => { setNaming({ mode: 'new' }); setDraft(''); };

 // ---- Terminal virtual ----
 function emitRun(kind: 'out' | 'err', text: string) {
  setTerm(t => [...t, { kind, text }]);
  setLogs(l => [...l, (kind === 'err' ? '✖ ' : '') + text].slice(-200));
  if (kind === 'err') setProblems(p => [...p, text]);
 }
 function runCommand(raw: string) {
  const line = raw.trim(); const [cmd = '', ...args] = line.split(/\s+/);
  const out: TermLine[] = [{ kind: 'in', text: line }];
  const print = (text: string, kind: 'out' | 'err' = 'out') => out.push({ kind, text });
  const fail = (err: string) => { if (err) print(err, 'err'); };
  const target = () => fileList.find(f => f.name === args[0]);
  if (cmd === 'clear') { setTerm([]); return; }
  switch (cmd) {
   case '': break;
   case 'help': print(HELP); break;
   case 'ls': print(fileList.map(f => f.name).join('   ') || '(kosong)'); break;
   case 'pwd': print('/bloom-project'); break;
   case 'date': print(new Date().toString()); break;
   case 'echo': print(args.join(' ')); break;
   case 'cat': { const f = target(); if (!args[0]) print('cat: butuh nama file', 'err'); else if (!f) print(`cat: ${args[0]}: tidak ada file`, 'err'); else print(f.content || '(kosong)'); break; }
   case 'touch': if (!args[0]) print('touch: butuh nama file', 'err'); else fail(createFile(args[0], false)); break;
   case 'rm': if (!args[0]) print('rm: butuh nama file', 'err'); else fail(removeFile(args[0])); break;
   case 'mv': if (args.length < 2) print('mv: pakai mv <lama> <baru>', 'err'); else fail(renameFile(args[0], args[1])); break;
   case 'open': { const f = target(); if (!f) print(`open: ${args[0] ?? ''}: tidak ada file`, 'err'); else openFile(f); break; }
   case 'node': {
    const f = target();
    if (!f) print(`node: ${args[0] ?? ''}: tidak ada file`, 'err');
    else if (!/\.m?js$/.test(f.name)) print('node: hanya bisa menjalankan file .js', 'err');
    else { setProblems([]); runInWorker(f.content, emitRun); }
    break;
   }
   default: print(`zsh: command not found: ${cmd}`, 'err');
  }
  setTerm(t => [...t, ...out]);
 }
 function submitCommand() {
  const h = cmdHistory.current; const line = command.trim();
  runCommand(command);
  if (line) h.push(line);
  cmdIndex.current = h.length; setCommand('');
 }
 function onTerminalKey(e: ReactKeyboardEvent<HTMLInputElement>) {
  const h = cmdHistory.current;
  if (e.key === 'ArrowUp') {
   e.preventDefault();
   if (cmdIndex.current > 0) { cmdIndex.current--; setCommand(h[cmdIndex.current] ?? ''); }
  } else if (e.key === 'ArrowDown') {
   e.preventDefault();
   if (cmdIndex.current < h.length - 1) { cmdIndex.current++; setCommand(h[cmdIndex.current] ?? ''); }
   else { cmdIndex.current = h.length; setCommand(''); }
  }
 }
 function toggleRun() {
  if (view === 'preview') { setView('editor'); return; }
  setLogs([]); setProblems([]); setPreviewKey(k => k + 1); setView('preview');
 }
 const lines = activeFile ? activeFile.content.split('\n') : [];
 const navigation = [{ id: 'files', icon: Files, label: 'Files' }, { id: 'search', icon: Search, label: 'Search' }, { id: 'editor', icon: Code2, label: 'Editor' }, { id: 'terminal', icon: Terminal, label: 'Terminal' }, { id: 'plugins', icon: Puzzle, label: 'Plugins' }] as const;
 const dirtyNames = [...dirty];
 return <div className="workspace">
  <header className="topbar">
   <div className="top-left"><div className="brand"><ChevronsLeftRight className="brand-mark" strokeWidth={2.5} /><span>kode<span className="brand-dot">.</span></span></div><nav className="top-menu"><Button variant="link" onClick={() => setView('files')}>File</Button><Button variant="link" onClick={() => setView('editor')}>Edit</Button><Button variant="link" onClick={() => setSidebar(!sidebar)}>View</Button><Button variant="link" onClick={() => setTerminalOpen(!terminalOpen)}>Terminal</Button></nav></div>
   <Button variant="ghost" className="workspace-search" onClick={() => setView('search')}><span className="flex items-center gap-2"><Search size={13} />Search workspace</span><kbd>⌘ K</kbd></Button>
   <div className="top-right"><span className="desktop-only text-xs text-muted-foreground"><span className="online-dot" />{dirty.size ? `${dirty.size} belum disimpan` : 'Semua perubahan tersimpan'}</span><IconButton label="Notifications" onClick={() => setNotice('You’re all caught up.')}><Bell size={17} /></IconButton><IconButton label="Editor settings" onClick={() => setView('settings')}><Settings2 size={17} /></IconButton><div className="avatar">FA</div></div>
  </header>
  <div className="main-layout">
   <aside className="activity-rail"><IconButton label="Explorer" className={`rail-button ${view === 'editor' || view === 'files' ? 'active' : ''}`} onClick={() => setView('files')}><Files /></IconButton><IconButton label="Search" className={`rail-button ${view === 'search' ? 'active' : ''}`} onClick={() => setView('search')}><Search /></IconButton><IconButton label="Source control" className="rail-button" onClick={() => setNotice(dirty.size ? `main · ${dirty.size} file diubah: ${dirtyNames.join(', ')}` : 'main · tidak ada perubahan')}><GitBranch /></IconButton><IconButton label="Run and preview" className={`rail-button ${view === 'preview' ? 'active' : ''}`} onClick={toggleRun}><Play /></IconButton><IconButton label="Plugins" className={`rail-button ${view === 'plugins' ? 'active' : ''}`} onClick={() => setView('plugins')}><Puzzle /></IconButton><div className="rail-bottom"><IconButton label="Keyboard shortcuts" className="rail-button" onClick={() => setView('settings')}><Keyboard /></IconButton><IconButton label="Settings" className="rail-button" onClick={() => setView('settings')}><Settings2 /></IconButton></div></aside>
   {sidebar && <aside className="explorer"><div className="panel-heading"><span className="eyebrow">EXPLORER</span><IconButton label="Explorer options" onClick={() => setNotice(`${fileList.length} file · bloom-project`)}><Ellipsis /></IconButton></div><div className="project-folder"><ChevronDown size={14} /><span>BLOOM-PROJECT</span><IconButton label="New file" className="ml-auto h-6 w-6" onClick={startNew}><FilePlus2 size={14} /></IconButton></div><div className="file-tree"><div className="project-folder text-muted-foreground font-normal"><ChevronRight size={13} /><Folder size={14} />assets</div>{fileRows(fileList)}</div><div className="sidebar-bottom"><div className="workspace-info"><div className="flex justify-between"><span className="eyebrow">YOUR WORKSPACE</span><Sparkles size={13} className="text-primary" /></div><p>A little space for your next big idea.</p><div className="storage-track" /><div className="flex justify-between text-[10px] text-muted-foreground"><span>28 MB of 100 MB</span><span>Free plan</span></div></div></div></aside>}
   <main className="editor-main">
    <div className="project-bar"><div><div className="project-title"><Folder size={18} className="folder-icon" />bloom-project<span className="tag">Personal</span><ChevronDown size={12} className="text-muted-foreground" /></div><div className="project-subtitle">Workspace <span className="mx-1">/</span> A little more possibility</div></div><div className="editor-actions"><IconButton label="Save file" onClick={save} className="h-8 w-8">{dirty.size ? <Download /> : <Check />}</IconButton><Button className="run-button" onClick={toggleRun}><Play fill="currentColor" size={13} />{view === 'preview' ? 'Editor' : 'Run'}<ChevronDown size={12} /></Button></div></div>
    {notice && <div role="status" className="flex items-center justify-between border-b border-border bg-secondary px-4 py-2 text-xs"><span>{notice}</span><IconButton label="Dismiss notification" className="h-5 w-5" onClick={() => setNotice('')}><X /></IconButton></div>}
    {view === 'editor' ? <>
     <div className="tabs-row"><div className="file-tabs">{openNames.map(name => fileList.find(f => f.name === name)).filter((f): f is FileItem => !!f).map(file => <Button variant="ghost" key={file.name} className={`file-tab ${activeName === file.name ? 'active' : ''}`} onClick={() => openFile(file)}><span className={`file-badge ${file.type}`}>{file.badge}</span>{file.name}{dirty.has(file.name) ? <span className="unsaved-dot" /> : <X size={12} className="tab-close" onClick={e => { e.stopPropagation(); closeFile(file.name); }} />}</Button>)}</div><IconButton label="New file" className="tab-action" onClick={() => { setView('files'); startNew(); }}><Plus size={15} /></IconButton><IconButton label="Toggle explorer" className="tab-action desktop-only" onClick={() => setSidebar(!sidebar)}><PanelLeftClose /></IconButton></div>
     {activeFile && <div className="breadcrumbs"><span>bloom-project</span><ChevronRight /><span className={`file-badge ${activeFile.type}`}>{activeFile.badge}</span><span className="current">{activeFile.name}</span><ChevronRight /><Braces /><span>{activeFile.language}</span></div>}
     <div className="editor-area"><div className="code-scroll">{activeFile ? <div className="code-lines" style={wrap ? { minWidth: 0 } : undefined}><div className="relative" style={wrap ? undefined : { width: 'max-content', minWidth: '100%' }}>
      {lines.map((line, i) => <div className={`code-line ${i + 1 === cursor.ln ? 'current' : ''}`} key={i} style={wrap ? { whiteSpace: 'pre-wrap' } : undefined}><span className="line-number">{i + 1}</span><div className="code-content" style={wrap ? { whiteSpace: 'pre-wrap', overflowWrap: 'break-word', minWidth: 0 } : undefined}>{highlighted(line)}</div></div>)}
      <textarea ref={taRef} key={activeFile.name} value={activeFile.content} spellCheck={false} autoCapitalize="off" autoCorrect="off" autoComplete="off" wrap={wrap ? 'soft' : 'off'} aria-label={`Editor ${activeFile.name}`} onChange={onEditorChange} onKeyDown={onEditorKey} onSelect={e => updateCursor(e.currentTarget)} onScroll={e => { e.currentTarget.scrollLeft = 0; e.currentTarget.scrollTop = 0; }} className="code-input" style={wrap ? { whiteSpace: 'pre-wrap' } : undefined} />
     </div></div> : <div className="p-8 text-muted-foreground">No open files</div>}</div><div className="minimap" aria-hidden="true">{Array.from({ length: 35 }, (_, i) => <div className="minimap-line" key={i} />)}</div></div>
     <div className="shortcut-bar" onMouseDown={e => e.preventDefault()}><Button variant="ghost" className="shortcut-key" title="Indent" onClick={() => insertAtCursor(indentUnit)}><ArrowUpRight />Tab</Button>{SHORTCUTS.map(([label, text, back]) => <Button variant="ghost" className="shortcut-key" key={label} onClick={() => insertAtCursor(text, back)}>{label}</Button>)}<Button variant="ghost" className="shortcut-key" title="Undo" onClick={undo}><Undo2 /></Button><Button variant="ghost" className="shortcut-key" title="Move cursor up" onClick={() => moveLine(-1)}><ArrowUp /></Button><Button variant="ghost" className="shortcut-key" title="Move cursor down" onClick={() => moveLine(1)}><ArrowDown /></Button></div>
    </> : <div className="content-panel">
     {view === 'files' && <><div className="flex items-center justify-between"><h1>Explorer</h1><Button variant="secondary" className="h-8 text-xs" onClick={startNew}><FilePlus2 size={14} />New file</Button></div><p className="description">bloom-project</p><div className="panel-files">{fileRows(fileList)}</div></>}
     {view === 'search' && <><h1>Search</h1><p className="description">bloom-project</p><input className="panel-search" placeholder="Search files…" aria-label="Search files" value={query} onChange={e => setQuery(e.target.value)} autoFocus /><div className="panel-files">{fileRows(fileList.filter(f => f.name.toLowerCase().includes(query.toLowerCase()) || f.content.toLowerCase().includes(query.toLowerCase())))}</div></>}
     {view === 'plugins' && <><h1>Plugins <span className="text-primary">&</span> extensions</h1><p className="description">Your editor, a little more you.</p><input className="panel-search" placeholder="Search extensions…" aria-label="Search extensions" value={query} onChange={e => setQuery(e.target.value)} /><div className="plugin-list">{plugins.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).map(p => <article className="plugin-card" key={p.name}><div className="plugin-logo font-mono font-bold text-xl">{p.symbol}</div><div className="flex-1"><h3>{p.name}</h3><div className="mb-2 text-[10px] text-muted-foreground">{p.author} <Check size={10} className="inline text-primary" /></div><p>{p.description}</p><div className="plugin-meta"><span className="flex items-center gap-1"><Download size={11} />{p.downloads}</span><span>★ 4.8</span><Button variant={installed.includes(p.name) ? 'secondary' : 'default'} className="ml-auto h-6 px-2 text-[9px]" onClick={() => { setInstalled(installed.includes(p.name) ? installed.filter(n => n !== p.name) : [...installed, p.name]); setNotice('Plugin installation is a UI demo only.'); }}>{installed.includes(p.name) ? 'Installed' : 'Install'}</Button></div></div></article>)}</div></>}
     {view === 'settings' && <><h1>Editor settings</h1><p className="description">Small details. A better flow.</p><div className="preference-row"><div>Auto indent<p>Keep every line in its place.</p></div><Button variant="ghost" role="switch" aria-checked={autoIndent} aria-label="Auto indent" className={`toggle ${autoIndent ? 'on' : ''}`} onClick={() => setAutoIndent(!autoIndent)}><span className="toggle-knob" /></Button></div><div className="preference-row"><div>Word wrap<p>Fit long lines within the editor.</p></div><Button variant="ghost" role="switch" aria-checked={wrap} aria-label="Word wrap" className={`toggle ${wrap ? 'on' : ''}`} onClick={() => setWrap(!wrap)}><span className="toggle-knob" /></Button></div><div className="preference-row"><span>Language</span><select aria-label="Settings language" className="language-select" value={language} onChange={e => setLanguage(e.target.value)}>{languages.map(l => <option key={l}>{l}</option>)}</select></div><div className="shortcut-list"><span className="eyebrow">KEYBOARD SHORTCUTS</span>{[['Save file', 'Ctrl + S'], ['Command palette', 'Ctrl + K'], ['Toggle terminal', 'Ctrl + `'], ['Outdent', 'Shift + Tab']].map(([label, key]) => <div className="shortcut-entry" key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</div></>}
     {view === 'preview' && <><div className="flex items-center justify-between"><span className="eyebrow">PREVIEW · SANDBOX</span><div className="flex"><IconButton label="Reload preview" onClick={() => { setLogs([]); setProblems([]); setPreviewKey(k => k + 1); }}><RefreshCw /></IconButton><IconButton label="Back to code" onClick={() => setView('editor')}><X /></IconButton></div></div>{previewDoc ? <iframe key={previewKey} ref={frameRef} title="Preview" sandbox="allow-scripts" srcDoc={previewDoc} className="mt-3 h-[60vh] min-h-[300px] w-full rounded-lg border border-border bg-white" /> : <p className="description mt-4">Tidak ada file HTML. Buat index.html dulu.</p>}</>}
    </div>}
    {terminalOpen && <section className="terminal" aria-label="Terminal panel"><div className="terminal-header"><div className="terminal-tabs">{['Terminal', 'Output', 'Problems'].map(tab => <Button key={tab} variant="ghost" className={`terminal-tab ${terminalTab === tab ? 'active' : ''}`} onClick={() => setTerminalTab(tab)}>{tab}{tab === 'Problems' && <span className="count">{problems.length}</span>}</Button>)}</div><div className="terminal-tools"><span className="shell-name"><Terminal size={12} />zsh</span><IconButton label="New terminal" onClick={() => { setTerm(INITIAL_TERM); setTerminalTab('Terminal'); }}><Plus /></IconButton><IconButton label="Clear terminal" onClick={() => { setTerm([]); setLogs([]); setProblems([]); }}><Trash2 /></IconButton><IconButton label="Close terminal" onClick={() => setTerminalOpen(false)}><X /></IconButton></div></div><div className="terminal-body" ref={termRef}>{terminalTab === 'Terminal' ? <>{term.map((l, i) => l.kind === 'in' ? <p key={i}><span className="text-primary">➜</span> <span className="syntax-number">bloom-project</span> {l.text}</p> : <p key={i} className={`whitespace-pre-wrap break-words ${l.kind === 'err' ? 'text-destructive' : 'terminal-muted'}`}>{l.text}</p>)}<form onSubmit={e => { e.preventDefault(); submitCommand(); }}><span className="text-primary">➜</span> <span className="syntax-number">bloom-project</span> <input aria-label="Terminal command" className="terminal-input" value={command} onChange={e => setCommand(e.target.value)} onKeyDown={onTerminalKey} placeholder="▍" enterKeyHint="send" spellCheck={false} autoCapitalize="off" autoCorrect="off" autoComplete="off" /></form></> : terminalTab === 'Problems' ? (problems.length ? problems.map((p, i) => <p key={i} className="text-destructive whitespace-pre-wrap break-words">✖ {p}</p>) : <p className="terminal-muted">No problems detected.</p>) : (logs.length ? logs.map((l, i) => <p key={i} className="terminal-muted whitespace-pre-wrap break-words">{l}</p>) : <p className="terminal-muted">[kode] Belum ada output. Tekan Run atau jalankan `node script.js`.</p>)}</div></section>}
   </main>
  </div>
  <footer className="statusbar"><div className="status-group"><span className="status-item"><GitBranch />main{dirty.size ? '*' : ''}</span><span className="status-item"><CircleX />{problems.length} <CircleAlert />0</span><span className="desktop-only status-item"><Check />{activeFile && dirty.has(activeFile.name) ? 'Unsaved' : 'Saved'}</span></div><div className="status-group"><span>Ln {cursor.ln}, Col {cursor.col}</span><span className="desktop-only">Spaces: 2</span><span className="desktop-only">UTF-8</span><select className="language-select" aria-label="Code language" value={language} onChange={e => setLanguage(e.target.value)}>{[...languages, 'Markdown', 'JSON', 'Text'].map(l => <option key={l}>{l}</option>)}</select><span className="status-item text-primary"><Check /><span className="desktop-only">Prettier</span></span></div></footer>
  <nav className="mobile-nav" aria-label="Mobile workspace navigation">{navigation.map(item => <Button variant="ghost" className={`mobile-nav-button ${(item.id === 'terminal' ? false : view === item.id) ? 'active' : ''}`} key={item.id} onClick={() => { setQuery(''); if (item.id === 'terminal') { setTerminalOpen(!terminalOpen); } else setView(item.id); }}><item.icon /><span>{item.label}</span></Button>)}</nav>
 </div>;
}
