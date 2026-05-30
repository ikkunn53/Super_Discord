import express from 'express';
import {
  getAllTargets,
  getTargetById,
  getChannelIdsByTargetId,
  insertTarget,
  updateTarget,
  deleteTarget
} from './db.js';

export function startWeb({ client }) {
  const app = express();
  app.use(express.urlencoded({ extended: true }));

  const esc = (s) => String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const layout = (title, body, { active = 'list' } = {}) => `
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    :root{
      --bg:#0b0f14;
      --panel:#0f1620;
      --panel2:#101a27;
      --text:#e7eef7;
      --muted:#9fb0c3;
      --border:#223044;
      --accent:#4aa3ff;
      --danger:#ff5c7a;
      --ok:#25d18a;
      --shadow: 0 10px 30px rgba(0,0,0,.35);
      --radius:14px;
      --radius-sm:10px;
      --pad:14px;
      --font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", "Yu Gothic", "Meiryo", Arial;
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family:var(--font);
      background: radial-gradient(900px 500px at 10% 0%, rgba(74,163,255,.12), transparent 60%),
                  radial-gradient(900px 500px at 90% 20%, rgba(37,209,138,.10), transparent 60%),
                  var(--bg);
      background-repeat: no-repeat;
      background-attachment: fixed;
      background-size: cover;
      color:var(--text);
    }
    a{color:var(--accent); text-decoration:none}
    a:hover{text-decoration:underline}
    .wrap{max-width:1360px; margin:22px auto; padding:0 16px}
    .top{
      display:flex; align-items:center; justify-content:space-between;
      gap:12px; margin-bottom:14px;
    }
    .brand{display:flex; flex-direction:column; gap:4px}
    .brand h1{font-size:18px; margin:0; letter-spacing:.2px}
    .brand .sub{font-size:12px; color:var(--muted)}
    .nav{
      display:flex; gap:8px; flex-wrap:wrap; align-items:center;
      background: rgba(255,255,255,.02);
      border:1px solid var(--border);
      border-radius:999px;
      padding:6px;
      box-shadow: var(--shadow);
    }
    .chip{
      padding:8px 12px;
      border-radius:999px;
      color:var(--muted);
      border:1px solid transparent;
      font-size:13px;
      cursor:pointer;
      display:inline-flex; align-items:center; gap:8px;
    }
    .chip.active{
      color:var(--text);
      background: rgba(74,163,255,.12);
      border-color: rgba(74,163,255,.35);
    }
    .card{
      background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01));
      border:1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow:hidden;
    }
    .card-h{
      padding:16px;
      display:flex; gap:12px;
      align-items:flex-end; justify-content:space-between;
      border-bottom:1px solid var(--border);
      background: rgba(16,26,39,.55);
    }
    .card-h .title{font-size:15px; margin:0}
    .card-h .right{display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end}
    .control{
      display:flex; flex-direction:column; gap:6px;
    }
    label{font-size:12px; color:var(--muted)}
    select, input[type="text"]{
      background: rgba(0,0,0,.25);
      border:1px solid var(--border);
      color: var(--text);
      padding:10px 12px;
      border-radius: 12px;
      outline:none;
      min-width: 340px;
    }
    select:focus, input[type="text"]:focus{border-color: rgba(74,163,255,.6); box-shadow: 0 0 0 3px rgba(74,163,255,.15)}
    .btn{
      background: rgba(74,163,255,.14);
      border:1px solid rgba(74,163,255,.45);
      color: var(--text);
      padding:10px 12px;
      border-radius:12px;
      cursor:pointer;
      font-weight:600;
      font-size:13px;
    }
    .btn:hover{filter:brightness(1.08)}
    .btn-danger{
      background: rgba(255,92,122,.10);
      border-color: rgba(255,92,122,.55);
    }
    .btn-ghost{
      background: transparent;
      border:1px solid var(--border);
      color: var(--text);
    }
    .table{
      width:100%;
      border-collapse:separate;
      border-spacing:0;
    }
    .table th, .table td{
      padding:12px 14px;
      border-bottom:1px solid rgba(34,48,68,.75);
      vertical-align:top;
      font-size:13px;
    }
    .table th{
      color: var(--muted);
      font-weight:600;
      background: rgba(16,26,39,.35);
      position: sticky;
      top:0;
      backdrop-filter: blur(6px);
      z-index: 1;
    }
    .mono{font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace}
    .muted{color:var(--muted)}
    .grid{
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      padding: 16px;
    }
    .field{
      display:flex;
      flex-direction:column;
      gap:8px;
    }
    .full{grid-column:1/-1}
    .channels-box{
      border:1px solid var(--border);
      border-radius: var(--radius);
      padding:12px;
      background: rgba(8,12,18,.85);
      max-height: 340px;
      overflow:auto;
    }
    .ch-item{
      display:flex;
      gap:10px;
      align-items:center;
      padding:8px 10px;
      border-radius: 12px;
    }
    .ch-item:hover{background: rgba(255,255,255,.04)}
    input[type="checkbox"]{transform: scale(1.15)}
    .footer{
      padding:14px 16px;
      border-top:1px solid var(--border);
      display:flex;
      justify-content:flex-end;
      gap:10px;
      background: rgba(16,26,39,.35);
    }
    .hint{font-size:12px; color:var(--muted); margin-top:8px}
    .pill{
      display:inline-block;
      padding:4px 10px;
      border:1px solid var(--border);
      border-radius:999px;
      color:var(--muted);
      font-size:12px;
      background: rgba(255,255,255,.02);
    }
    .ops{display:flex; gap:10px; align-items:center}
    .ops form{display:inline}
    .err{
      margin:12px 0 0;
      padding:12px 14px;
      border-radius:12px;
      border:1px solid rgba(255,92,122,.5);
      background: rgba(255,92,122,.10);
      color: var(--text);
    }
    @media (max-width: 820px){
      select, input[type="text"]{min-width: 240px; width:100%}
      .grid{grid-template-columns:1fr}
      .card-h{align-items:flex-start; flex-direction:column}
      .card-h .right{justify-content:flex-start}
    }
  
    /* Discordチャンネル選択の背景を黒寄りに固定（見やすさ改善） */
    #channelSelect{
      background:#0b0f14;
    }
    #channelSelect option{
      background:#0b0f14;
      color:var(--text);
    }

  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="brand">
        <h1>Notify Bot Web</h1>
        <div class="sub">登録リスト・追加・編集</div>
      </div>
      <div class="nav">
        <a class="chip ${active==='list'?'active':''}" href="/list">リスト</a>
        <a class="chip ${active==='add'?'active':''}" href="/add">追加</a>
      </div>
    </div>
    ${body}
  </div>
</body>
</html>
`;

  async function getWebGuild() {
    if (!client?.isReady?.()) return null;

    const configuredGuildId = (process.env.WEB_GUILD_ID || '').trim();
    if (configuredGuildId) {
      return client.guilds.fetch(configuredGuildId).catch(() => null);
    }

    const c = await client.channels.fetch(process.env.CONSOLE_CHANNEL_ID).catch(() => null);
    return c?.guild ?? null;
  }

  async function guildChannels() {
    const guild = await getWebGuild();
    if (!guild) return [];

    const channels = await guild.channels.fetch().catch(() => null);
    const values = channels ? [...channels.values()] : [...guild.channels.cache.values()];

    return values
      .filter(ch => ch?.isTextBased?.() && !ch.isThread())
      .map(ch => ({ id: ch.id, name: ch.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }

  // =====================
  // List (auto filter by Discord channel)
  // =====================
  app.get(['/', '/list'], async (req, res) => {
    const selectedChannelId = (req.query.channel_id ?? '').toString().trim(); // empty => all
    const channels = await guildChannels();

    const all = getAllTargets();
    const rows = selectedChannelId
      ? all.filter(t => getChannelIdsByTargetId(t.id).includes(selectedChannelId))
      : all;

    const channelOptions = [
      `<option value="" ${selectedChannelId ? '' : 'selected'}>（すべて表示）</option>`,
      ...channels.map(c =>
        `<option value="${c.id}" ${c.id === selectedChannelId ? 'selected' : ''}>#${esc(c.name)}</option>`
      )
    ].join('');

    const body = `
      <div class="card">
        <div class="card-h">
          <div>
            <p class="title" style="margin:0;">登録リスト</p>
            <div class="hint">Discordチャンネルを選ぶと自動で表示が切り替わります（ボタン不要）</div>
          </div>

          <div class="right">
            <div class="control">
              <label>Discordチャンネルで絞り込み</label>
              <form id="filterForm" method="get" action="/list">
                <select name="channel_id" id="channelSelect" onchange="document.getElementById('filterForm').submit()">
                  ${channelOptions}
                </select>
              </form>
            </div>
            <span class="pill">表示件数: ${rows.length}</span>
          </div>
        </div>

        <div style="overflow:auto; max-height: calc(100vh - 180px);">
          <table class="table">
            <tr>
              <th style="min-width:72px;">ID</th>
              <th style="min-width:160px;">操作</th>
              <th style="min-width:260px;">X(RSS)</th>
              <th style="min-width:260px;">YouTube</th>
              <th style="min-width:220px;">Twitch</th>
              <th style="min-width:220px;">Channels</th>
            </tr>
            ${rows.map(r => `
              <tr>
                <td class="mono">${r.id}</td>
                <td class="ops">
                  <a class="btn btn-ghost" href="/edit/${r.id}">編集</a>
                  <form method="post" action="/delete/${r.id}">
                    <button class="btn btn-danger" type="submit" onclick="return confirm('削除しますか？')">削除</button>
                  </form>
                </td>
                <td>${r.x_rss ? `<span class="mono">${esc(r.x_rss)}</span>` : `<span class="muted">—</span>`}</td>
                <td>${r.youtube ? `<span class="mono">${esc(r.youtube)}</span>` : `<span class="muted">—</span>`}</td>
                <td>${r.twitch ? `<span class="mono">${esc(r.twitch)}</span>` : `<span class="muted">—</span>`}</td>
                <td class="mono">${esc(getChannelIdsByTargetId(r.id).join(', '))}</td>
              </tr>
            `).join('') || `<tr><td colspan="6" class="muted">データなし</td></tr>`}
          </table>
        </div>
      </div>
    `;

    res.send(layout('登録リスト', body, { active: 'list' }));
  });

  // =====================
  // Add (checkbox)
  // =====================
  app.get('/add', async (req, res) => {
    const ch = await guildChannels();
    const body = `
      <div class="card">
        <div class="card-h">
          <div>
            <p class="title" style="margin:0;">追加</p>
            <div class="hint">X(RSS) / YouTube / Twitch は空欄OK（空欄は登録しません）。チャンネルは1つ以上必要です。</div>
          </div>
        </div>

        <form method="post" action="/add">
          <div class="grid">
            <div class="field full">
              <label>Discordチャンネル（複数選択）</label>
              <div class="channels-box">
                ${ch.map(c => `
                  <label class="ch-item">
                    <input type="checkbox" name="channel_ids" value="${c.id}">
                    <span>#${esc(c.name)}</span>
                    <span class="muted mono">(${c.id})</span>
                  </label>
                `).join('') || `<div class="muted">チャンネル取得に失敗しました（WEB_GUILD_ID または CONSOLE_CHANNEL_ID の Guild を確認）</div>`}
              </div>
            </div>

            <div class="field">
              <label>X(RSS)</label>
              <input type="text" name="x_rss" placeholder="https://..." />
            </div>

            <div class="field">
              <label>YouTube</label>
              <input type="text" name="youtube" placeholder="channel_id / feed URL / channel URL / @handle / channel name" />
            </div>

            <div class="field full">
              <label>Twitch</label>
              <input type="text" name="twitch" placeholder="login (例: shroud)" />
            </div>
          </div>

          <div class="footer">
            <a class="btn btn-ghost" href="/list">戻る</a>
            <button class="btn" type="submit">追加する</button>
          </div>
        </form>
      </div>
    `;
    res.send(layout('追加', body, { active: 'add' }));
  });

  app.post('/add', (req, res) => {
    const ids = [].concat(req.body.channel_ids || []);
    try {
      insertTarget({ ...req.body, channel_ids: ids });
      res.redirect('/list');
    } catch (e) {
      const body = `<div class="err">${esc(e.message || 'add failed')}</div><div style="margin-top:10px;"><a class="btn btn-ghost" href="/add">戻る</a></div>`;
      res.status(400).send(layout('追加エラー', body, { active: 'add' }));
    }
  });

  // =====================
  // Edit (checkbox)
  // =====================
  app.get('/edit/:id', async (req, res) => {
    const r = getTargetById(Number(req.params.id));
    if (!r) return res.status(404).send(layout('not found', `<div class="err">not found</div>`));

    const sel = new Set(getChannelIdsByTargetId(r.id));
    const ch = await guildChannels();

    const body = `
      <div class="card">
        <div class="card-h">
          <div>
            <p class="title" style="margin:0;">編集 <span class="pill mono">#${r.id}</span></p>
            <div class="hint">保存するとチャンネル紐づけと各値が更新されます。</div>
          </div>
        </div>

        <form method="post" action="/edit/${r.id}">
          <div class="grid">
            <div class="field full">
              <label>Discordチャンネル（複数選択）</label>
              <div class="channels-box">
                ${ch.map(c => `
                  <label class="ch-item">
                    <input type="checkbox" name="channel_ids" value="${c.id}" ${sel.has(c.id) ? 'checked' : ''}>
                    <span>#${esc(c.name)}</span>
                    <span class="muted mono">(${c.id})</span>
                  </label>
                `).join('')}
              </div>
            </div>

            <div class="field">
              <label>X(RSS)</label>
              <input type="text" name="x_rss" value="${esc(r.x_rss)}" />
            </div>

            <div class="field">
              <label>YouTube</label>
              <input type="text" name="youtube" value="${esc(r.youtube)}" />
            </div>

            <div class="field full">
              <label>Twitch</label>
              <input type="text" name="twitch" value="${esc(r.twitch)}" />
            </div>
          </div>

          <div class="footer">
            <a class="btn btn-ghost" href="/list">戻る</a>
            <button class="btn" type="submit">保存する</button>
          </div>
        </form>
      </div>
    `;
    res.send(layout('編集', body, { active: 'list' }));
  });

  app.post('/edit/:id', (req, res) => {
    const ids = [].concat(req.body.channel_ids || []);
    try {
      updateTarget(Number(req.params.id), { ...req.body, channel_ids: ids });
      res.redirect('/list');
    } catch (e) {
      const body = `<div class="err">${esc(e.message || 'edit failed')}</div><div style="margin-top:10px;"><a class="btn btn-ghost" href="/edit/${esc(req.params.id)}">戻る</a></div>`;
      res.status(400).send(layout('編集エラー', body));
    }
  });

  app.post('/delete/:id', (req, res) => {
    deleteTarget(Number(req.params.id));
    res.redirect('/list');
  });

  const port = Number(process.env.WEB_PORT || 3000);
  const server = app.listen(port);
  server.on('listening', () => {
    console.log(`Web: http://localhost:${port}/list`);
  });
  server.on('error', (e) => {
    if (e?.code === 'EADDRINUSE') {
      console.error(`WEB_PORT ${port} is already in use. Web UI was not started.`);
      return;
    }
    console.error('[web server error]', e);
  });

  return server;
}
