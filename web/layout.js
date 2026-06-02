import { esc } from './html.js';

const styles = `
:root{--bg:#0b0f14;--panel:#0f1620;--panel2:#101a27;--text:#e7eef7;--muted:#9fb0c3;--border:#223044;--accent:#4aa3ff;--danger:#ff5c7a;--ok:#25d18a;--warn:#ffd166;--shadow:0 10px 30px rgba(0,0,0,.35);--radius:14px;--font:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,"Hiragino Sans","Noto Sans JP","Yu Gothic UI","Yu Gothic","Meiryo",Arial}
*{box-sizing:border-box} body{margin:0;font-family:var(--font);background:radial-gradient(900px 500px at 10% 0%,rgba(74,163,255,.12),transparent 60%),radial-gradient(900px 500px at 90% 20%,rgba(37,209,138,.10),transparent 60%),var(--bg);background-attachment:fixed;color:var(--text)}
a{color:var(--accent);text-decoration:none} a:hover{text-decoration:underline}.wrap{max-width:1480px;margin:22px auto;padding:0 16px}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.brand h1{font-size:18px;margin:0}.brand .sub{font-size:12px;color:var(--muted);margin-top:4px}.nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:999px;padding:6px;box-shadow:var(--shadow)}
.chip{padding:8px 12px;border-radius:999px;color:var(--muted);border:1px solid transparent;font-size:13px;display:inline-flex;align-items:center;gap:8px}.chip.active{color:var(--text);background:rgba(74,163,255,.12);border-color:rgba(74,163,255,.35)}
.card{background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01));border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;margin-bottom:14px}.card-h{padding:16px;display:flex;gap:12px;align-items:flex-end;justify-content:space-between;border-bottom:1px solid var(--border);background:rgba(16,26,39,.55)}.card-h .title{font-size:15px;margin:0}.card-h .right{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
label{font-size:12px;color:var(--muted)} select,input[type="text"],input[type="number"]{background:rgba(0,0,0,.25);border:1px solid var(--border);color:var(--text);padding:10px 12px;border-radius:12px;outline:none;min-width:260px} select:focus,input:focus{border-color:rgba(74,163,255,.6);box-shadow:0 0 0 3px rgba(74,163,255,.15)}
.btn{background:rgba(74,163,255,.14);border:1px solid rgba(74,163,255,.45);color:var(--text);padding:10px 12px;border-radius:12px;cursor:pointer;font-weight:600;font-size:13px;display:inline-block}.btn:hover{filter:brightness(1.08);text-decoration:none}.btn-danger{background:rgba(255,92,122,.10);border-color:rgba(255,92,122,.55)}.btn-ok{background:rgba(37,209,138,.10);border-color:rgba(37,209,138,.55)}.btn-ghost{background:transparent;border:1px solid var(--border);color:var(--text)}
.table{width:100%;border-collapse:separate;border-spacing:0}.table th,.table td{padding:12px 14px;border-bottom:1px solid rgba(34,48,68,.75);vertical-align:top;font-size:13px}.table th{color:var(--muted);font-weight:600;background:rgba(16,26,39,.35);position:sticky;top:0;backdrop-filter:blur(6px);z-index:1}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}.muted{color:var(--muted)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:16px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;padding:16px}.stat{border:1px solid var(--border);border-radius:14px;padding:14px;background:rgba(8,12,18,.65)}.stat .n{font-size:24px;font-weight:700;margin-top:6px}.field{display:flex;flex-direction:column;gap:8px}.full{grid-column:1/-1}.channels-box{border:1px solid var(--border);border-radius:var(--radius);padding:12px;background:rgba(8,12,18,.85);max-height:340px;overflow:auto}.ch-item{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:12px}.ch-item:hover{background:rgba(255,255,255,.04)}input[type="checkbox"]{transform:scale(1.15)}
.footer{padding:14px 16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;background:rgba(16,26,39,.35)}.hint{font-size:12px;color:var(--muted);margin-top:8px}.pill{display:inline-block;padding:4px 10px;border:1px solid var(--border);border-radius:999px;color:var(--muted);font-size:12px;background:rgba(255,255,255,.02)}.pill.ok{color:var(--ok);border-color:rgba(37,209,138,.4)}.pill.warn{color:var(--warn);border-color:rgba(255,209,102,.4)}.pill.err{color:var(--danger);border-color:rgba(255,92,122,.5)}.ops{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ops form{display:inline}.errbox,.okbox{margin:12px 0 0;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,92,122,.5);background:rgba(255,92,122,.10)}.okbox{border-color:rgba(37,209,138,.5);background:rgba(37,209,138,.10)}
@media(max-width:820px){select,input[type="text"],input[type="number"]{min-width:240px;width:100%}.grid{grid-template-columns:1fr}.card-h{align-items:flex-start;flex-direction:column}.card-h .right{justify-content:flex-start}}
`;

export function layout(title, body, { active = 'list' } = {}) {
  const nav = [
    ['dashboard', '/dashboard', 'ダッシュボード'],
    ['list', '/list', 'リスト'],
    ['add', '/add', '追加'],
    ['history', '/history', '投稿履歴']
  ].map(([key, href, label]) => `<a class="chip ${active === key ? 'active' : ''}" href="${href}">${label}</a>`).join('');

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(title)}</title>
  <style>${styles}</style>
</head>
<body><div class="wrap"><div class="top"><div class="brand"><h1>Notify Bot Web</h1><div class="sub">状態確認・登録リスト・追加・編集・履歴</div></div><div class="nav">${nav}</div></div>${body}</div></body></html>`;
}
