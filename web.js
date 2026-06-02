import express from 'express';
import { PermissionFlagsBits } from 'discord.js';
import {
  getAllTargets,
  getTargetById,
  getChannelIdsByTargetId,
  insertTarget,
  updateTarget,
  deleteTarget,
  setTargetEnabled,
  getTargetStatusMap,
  getTargetStatuses,
  getDashboardStats,
  getPostedHistory,
  deletePosted,
  cleanupPostedOlderThan
} from './db.js';
import { validateYouTubeInput } from './youtubeWorker.js';
import { formatNotificationContent } from './notifyFormat.js';

export function startWeb({ client }) {
  const app = express();
  app.use(express.urlencoded({ extended: true }));

  const esc = (s) => String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const fmt = (v) => v ? esc(new Date(v).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })) : '<span class="muted">—</span>';
  const pill = (text, cls = '') => `<span class="pill ${cls}">${esc(text)}</span>`;

  const layout = (title, body, { active = 'list' } = {}) => `
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
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
  </style>
</head>
<body><div class="wrap"><div class="top"><div class="brand"><h1>Notify Bot Web</h1><div class="sub">状態確認・登録リスト・追加・編集・履歴</div></div><div class="nav">
  <a class="chip ${active==='dashboard'?'active':''}" href="/dashboard">ダッシュボード</a>
  <a class="chip ${active==='list'?'active':''}" href="/list">リスト</a>
  <a class="chip ${active==='add'?'active':''}" href="/add">追加</a>
  <a class="chip ${active==='history'?'active':''}" href="/history">投稿履歴</a>
</div></div>${body}</div></body></html>`;

  async function getWebGuild() {
    if (!client?.isReady?.()) return null;
    const configuredGuildId = (process.env.WEB_GUILD_ID || '').trim();
    if (configuredGuildId) return client.guilds.fetch(configuredGuildId).catch(() => null);
    const c = await client.channels.fetch(process.env.CONSOLE_CHANNEL_ID).catch(() => null);
    return c?.guild ?? null;
  }

  async function guildChannels() {
    const guild = await getWebGuild();
    if (!guild) return [];
    const channels = await guild.channels.fetch().catch(() => null);
    const values = channels ? [...channels.values()] : [...guild.channels.cache.values()];
    return values.filter(ch => ch?.isTextBased?.() && !ch.isThread()).map(ch => {
      const perms = ch.permissionsFor(client.user);
      return { id: ch.id, name: ch.name, canSend: !!perms?.has(PermissionFlagsBits.SendMessages), canView: !!perms?.has(PermissionFlagsBits.ViewChannel) };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }

  function platformLabels(target) {
    return [target.x_rss ? 'x_rss' : null, target.youtube ? 'youtube' : null, target.twitch ? 'twitch' : null].filter(Boolean);
  }

  function statusHtml(target, statusMap) {
    const statuses = platformLabels(target).map(p => statusMap.get(`${target.id}:${p}`));
    if (statuses.length === 0 || statuses.every(s => !s)) return '<span class="muted">未チェック</span>';
    return statuses.map((s, idx) => {
      const p = platformLabels(target)[idx];
      if (!s) return `${pill(p, 'warn')} <span class="muted">未チェック</span>`;
      const failing = s.last_error_at && (!s.last_success_at || s.last_error_at > s.last_success_at);
      return `${pill(p, failing ? 'err' : 'ok')} ${failing ? esc(s.last_error_message || 'エラー') : '正常'}<br><span class="muted">最終: ${fmt(s.last_checked_at)}</span>`;
    }).join('<br>');
  }

  function enabledInput(checked = true) {
    return `<label class="ch-item"><input type="checkbox" name="enabled" value="1" ${checked ? 'checked' : ''}><span>この対象を有効にする</span></label>`;
  }

  app.get(['/', '/dashboard'], (req, res) => {
    const stats = getDashboardStats();
    const statuses = getTargetStatuses().slice(0, 12);
    const body = `<div class="card"><div class="card-h"><div><p class="title">ダッシュボード</p><div class="hint">登録数・投稿履歴・直近ステータスを確認できます。</div></div></div>
      <div class="stats">
        <div class="stat"><div class="muted">登録対象</div><div class="n">${stats.targets.total || 0}</div><div class="hint">有効 ${stats.targets.enabled || 0} / 停止 ${stats.targets.disabled || 0}</div></div>
        <div class="stat"><div class="muted">YouTube</div><div class="n">${stats.targets.youtube || 0}</div></div>
        <div class="stat"><div class="muted">X/RSS</div><div class="n">${stats.targets.x_rss || 0}</div></div>
        <div class="stat"><div class="muted">Twitch</div><div class="n">${stats.targets.twitch || 0}</div></div>
        <div class="stat"><div class="muted">投稿履歴</div><div class="n">${stats.posted.total || 0}</div><div class="hint">最新: ${fmt(stats.posted.latest)}</div></div>
        <div class="stat"><div class="muted">未解消エラー</div><div class="n">${stats.errors.total || 0}</div></div>
      </div></div>
      <div class="card"><div class="card-h"><p class="title">直近ステータス</p></div><div style="overflow:auto"><table class="table"><tr><th>対象</th><th>種別</th><th>最終チェック</th><th>最終成功</th><th>最終エラー</th><th>投稿/スキップ</th></tr>
      ${statuses.map(s => `<tr><td class="mono">#${s.target_id}</td><td>${pill(s.platform)}</td><td>${fmt(s.last_checked_at)}</td><td>${fmt(s.last_success_at)}</td><td>${s.last_error_message ? `<span class="err">${esc(s.last_error_message)}</span><br>${fmt(s.last_error_at)}` : '<span class="muted">—</span>'}</td><td>${s.last_posted_count}/${s.last_skipped_count}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">データなし</td></tr>'}
      </table></div></div>`;
    res.send(layout('ダッシュボード', body, { active: 'dashboard' }));
  });

  app.get('/list', async (req, res) => {
    const selectedChannelId = (req.query.channel_id ?? '').toString().trim();
    const channels = await guildChannels();
    const statusMap = getTargetStatusMap();
    const all = getAllTargets();
    const rows = selectedChannelId ? all.filter(t => getChannelIdsByTargetId(t.id).includes(selectedChannelId)) : all;
    const channelOptions = [`<option value="" ${selectedChannelId ? '' : 'selected'}>（すべて表示）</option>`, ...channels.map(c => `<option value="${c.id}" ${c.id === selectedChannelId ? 'selected' : ''}>#${esc(c.name)}</option>`)].join('');
    const body = `<div class="card"><div class="card-h"><div><p class="title">登録リスト</p><div class="hint">無効化した対象は監視/バックフィルから除外されます。</div></div><div class="right"><form method="get" action="/list"><label>Discordチャンネルで絞り込み</label><br><select name="channel_id" onchange="this.form.submit()">${channelOptions}</select></form>${pill(`表示件数: ${rows.length}`)}</div></div>
      <div style="overflow:auto;max-height:calc(100vh - 180px)"><table class="table"><tr><th>ID</th><th>状態</th><th>操作</th><th>X(RSS)</th><th>YouTube</th><th>Twitch</th><th>Channels</th><th>チェック状態</th></tr>
      ${rows.map(r => `<tr><td class="mono">${r.id}</td><td>${r.enabled ? pill('有効','ok') : pill('停止中','warn')}</td><td class="ops"><a class="btn btn-ghost" href="/edit/${r.id}">編集</a><form method="post" action="/toggle/${r.id}"><button class="btn btn-ghost" type="submit">${r.enabled ? '停止' : '有効化'}</button></form><form method="post" action="/test/${r.id}"><button class="btn btn-ok" type="submit">テスト通知</button></form><form method="post" action="/delete/${r.id}"><button class="btn btn-danger" type="submit" onclick="return confirm('削除しますか？')">削除</button></form></td><td>${r.x_rss ? `<span class="mono">${esc(r.x_rss)}</span>` : '<span class="muted">—</span>'}</td><td>${r.youtube ? `<span class="mono">${esc(r.youtube)}</span><br><a href="/validate/youtube/${r.id}">検証</a>` : '<span class="muted">—</span>'}</td><td>${r.twitch ? `<span class="mono">${esc(r.twitch)}</span>` : '<span class="muted">—</span>'}</td><td class="mono">${esc(getChannelIdsByTargetId(r.id).join(', '))}</td><td>${statusHtml(r, statusMap)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">データなし</td></tr>'}
      </table></div></div>`;
    res.send(layout('登録リスト', body, { active: 'list' }));
  });

  app.get('/add', async (req, res) => {
    const ch = await guildChannels();
    const body = `<div class="card"><div class="card-h"><div><p class="title">追加</p><div class="hint">X(RSS) / YouTube / Twitch は空欄OK。チャンネルは1つ以上必要です。</div></div></div><form method="post" action="/add"><div class="grid"><div class="field full"><label>状態</label>${enabledInput(true)}</div><div class="field full"><label>Discordチャンネル（複数選択）</label><div class="channels-box">${ch.map(c => `<label class="ch-item"><input type="checkbox" name="channel_ids" value="${c.id}"><span>#${esc(c.name)}</span><span class="muted mono">(${c.id})</span>${c.canSend ? pill('送信可','ok') : pill('送信不可','err')}</label>`).join('') || '<div class="muted">チャンネル取得に失敗しました</div>'}</div></div><div class="field"><label>X(RSS)</label><input type="text" name="x_rss" placeholder="https://..." /></div><div class="field"><label>YouTube</label><input type="text" name="youtube" placeholder="channel_id / feed URL / channel URL / @handle / channel name" /></div><div class="field full"><label>Twitch</label><input type="text" name="twitch" placeholder="login (例: shroud)" /></div></div><div class="footer"><a class="btn btn-ghost" href="/list">戻る</a><button class="btn" type="submit">追加する</button></div></form></div>`;
    res.send(layout('追加', body, { active: 'add' }));
  });

  app.post('/add', (req, res) => {
    const ids = [].concat(req.body.channel_ids || []);
    try { insertTarget({ ...req.body, enabled: req.body.enabled ? 1 : 0, channel_ids: ids }); res.redirect('/list'); }
    catch (e) { res.status(400).send(layout('追加エラー', `<div class="errbox">${esc(e.message || 'add failed')}</div><div style="margin-top:10px"><a class="btn btn-ghost" href="/add">戻る</a></div>`, { active: 'add' })); }
  });

  app.get('/edit/:id', async (req, res) => {
    const r = getTargetById(Number(req.params.id));
    if (!r) return res.status(404).send(layout('not found', '<div class="errbox">not found</div>'));
    const sel = new Set(getChannelIdsByTargetId(r.id));
    const ch = await guildChannels();
    const body = `<div class="card"><div class="card-h"><div><p class="title">編集 ${pill(`#${r.id}`)}</p><div class="hint">保存するとチャンネル紐づけと各値が更新されます。</div></div><div class="right">${r.youtube ? `<a class="btn btn-ghost" href="/validate/youtube/${r.id}">YouTube検証</a>` : ''}</div></div><form method="post" action="/edit/${r.id}"><div class="grid"><div class="field full"><label>状態</label>${enabledInput(!!r.enabled)}</div><div class="field full"><label>Discordチャンネル（複数選択）</label><div class="channels-box">${ch.map(c => `<label class="ch-item"><input type="checkbox" name="channel_ids" value="${c.id}" ${sel.has(c.id) ? 'checked' : ''}><span>#${esc(c.name)}</span><span class="muted mono">(${c.id})</span>${c.canSend ? pill('送信可','ok') : pill('送信不可','err')}</label>`).join('')}</div></div><div class="field"><label>X(RSS)</label><input type="text" name="x_rss" value="${esc(r.x_rss)}" /></div><div class="field"><label>YouTube</label><input type="text" name="youtube" value="${esc(r.youtube)}" /></div><div class="field full"><label>Twitch</label><input type="text" name="twitch" value="${esc(r.twitch)}" /></div></div><div class="footer"><a class="btn btn-ghost" href="/list">戻る</a><button class="btn" type="submit">保存する</button></div></form></div>`;
    res.send(layout('編集', body, { active: 'list' }));
  });

  app.post('/edit/:id', (req, res) => {
    const ids = [].concat(req.body.channel_ids || []);
    try { updateTarget(Number(req.params.id), { ...req.body, enabled: req.body.enabled ? 1 : 0, channel_ids: ids }); res.redirect('/list'); }
    catch (e) { res.status(400).send(layout('編集エラー', `<div class="errbox">${esc(e.message || 'edit failed')}</div><div style="margin-top:10px"><a class="btn btn-ghost" href="/edit/${esc(req.params.id)}">戻る</a></div>`)); }
  });

  app.post('/toggle/:id', (req, res) => {
    const r = getTargetById(Number(req.params.id));
    if (r) setTargetEnabled(r.id, r.enabled ? 0 : 1);
    res.redirect('/list');
  });

  app.post('/test/:id', async (req, res) => {
    const r = getTargetById(Number(req.params.id));
    if (!r) return res.status(404).send(layout('not found', '<div class="errbox">not found</div>'));
    const ids = getChannelIdsByTargetId(r.id);
    const content = formatNotificationContent('twitch', { targetId: r.id, title: 'テスト通知', url: 'https://example.com/test' });
    let sent = 0;
    for (const chId of ids) {
      const ch = await client.channels.fetch(chId).catch(() => null);
      if (!ch?.isTextBased()) continue;
      const perms = ch.permissionsFor?.(client.user);
      if (perms && !perms.has(PermissionFlagsBits.SendMessages)) continue;
      await ch.send({ content: `✅ Notify Bot テスト通知\n対象ID: #${r.id}\n${content}`, allowedMentions: { parse: [] } }).catch(() => null);
      sent++;
    }
    res.send(layout('テスト通知', `<div class="${sent ? 'okbox' : 'errbox'}">テスト通知を ${sent} チャンネルへ送信しました。</div><div style="margin-top:10px"><a class="btn btn-ghost" href="/list">戻る</a></div>`, { active: 'list' }));
  });

  app.get('/validate/youtube/:id', async (req, res) => {
    const r = getTargetById(Number(req.params.id));
    if (!r?.youtube) return res.status(404).send(layout('YouTube検証', '<div class="errbox">YouTube設定がありません。</div>'));
    const result = await validateYouTubeInput(r.youtube);
    const body = `<div class="card"><div class="card-h"><div><p class="title">YouTube検証 ${pill(`#${r.id}`)}</p><div class="hint">登録値をチャンネルID/RSSへ解決し、RSS取得を試します。</div></div></div><div class="grid"><div class="field full">${result.ok ? `<div class="okbox">✅ ${esc(result.message)}</div>` : `<div class="errbox">❌ ${esc(result.message)}</div>`}</div><div class="field"><label>RSS URL</label><div class="mono">${result.feedUrl ? esc(result.feedUrl) : '<span class="muted">—</span>'}</div></div><div class="field"><label>item数</label><div>${esc(result.itemCount ?? 0)}</div></div><div class="field full"><label>最新動画</label><div>${result.latestTitle ? `${esc(result.latestTitle)}<br><a href="${esc(result.latestUrl)}">${esc(result.latestUrl)}</a>` : '<span class="muted">—</span>'}</div></div><div class="field full"><label>診断</label><div class="mono">${(result.diagnostics || []).map(esc).join('<br>') || '<span class="muted">—</span>'}</div></div></div><div class="footer"><a class="btn btn-ghost" href="/list">戻る</a></div></div>`;
    res.send(layout('YouTube検証', body, { active: 'list' }));
  });

  app.get('/history', (req, res) => {
    const rows = getPostedHistory({ limit: req.query.limit || 100 });
    const retention = Number(process.env.POSTED_RETENTION_DAYS || 0);
    const body = `<div class="card"><div class="card-h"><div><p class="title">投稿履歴</p><div class="hint">重複投稿防止に使っている履歴です。削除すると再通知される可能性があります。</div></div><div class="right"><form method="post" action="/history/cleanup"><input type="number" name="days" min="1" placeholder="日数" value="${retention || ''}"><button class="btn btn-danger" type="submit" onclick="return confirm('指定日数より古い履歴を削除しますか？')">古い履歴を削除</button></form></div></div><div style="overflow:auto"><table class="table"><tr><th>ID</th><th>対象</th><th>種別</th><th>タイトル</th><th>URL</th><th>公開日時</th><th>投稿日時</th><th>操作</th></tr>${rows.map(r => `<tr><td class="mono">${r.id}</td><td class="mono">#${r.target_id}</td><td>${pill(r.platform)}</td><td>${esc(r.item_title || '') || '<span class="muted">—</span>'}</td><td>${r.item_url ? `<a href="${esc(r.item_url)}">${esc(r.item_url)}</a>` : '<span class="muted">—</span>'}</td><td>${fmt(r.item_published_at)}</td><td>${fmt(r.posted_at)}</td><td><form method="post" action="/history/delete/${r.id}"><button class="btn btn-danger" type="submit" onclick="return confirm('履歴を削除しますか？再通知される可能性があります。')">削除</button></form></td></tr>`).join('') || '<tr><td colspan="8" class="muted">データなし</td></tr>'}</table></div></div>`;
    res.send(layout('投稿履歴', body, { active: 'history' }));
  });

  app.post('/history/delete/:id', (req, res) => { deletePosted(Number(req.params.id)); res.redirect('/history'); });
  app.post('/history/cleanup', (req, res) => { cleanupPostedOlderThan(req.body.days); res.redirect('/history'); });
  app.post('/delete/:id', (req, res) => { deleteTarget(Number(req.params.id)); res.redirect('/list'); });

  const retentionDays = Number(process.env.POSTED_RETENTION_DAYS || 0);
  if (Number.isFinite(retentionDays) && retentionDays > 0) cleanupPostedOlderThan(retentionDays);

  const port = Number(process.env.WEB_PORT || 3000);
  const server = app.listen(port);
  server.on('listening', () => console.log(`Web: http://localhost:${port}/dashboard`));
  server.on('error', (e) => {
    if (e?.code === 'EADDRINUSE') return console.error(`WEB_PORT ${port} はすでに使用中です。Web UIを起動できませんでした。`);
    console.error('[Webサーバーエラー]', e);
  });
  return server;
}
