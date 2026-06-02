import { PermissionFlagsBits } from 'discord.js';
import {
  getAllTargets,
  getTargetById,
  getChannelIdsByTargetId,
  insertTarget,
  updateTarget,
  deleteTarget,
  setTargetEnabled,
  getTargetStatusMap
} from '../../db.js';
import { validateYouTubeInput } from '../../youtubeWorker.js';
import { formatNotificationContent } from '../../notifyFormat.js';
import { esc, fmt, pill, statusHtml, enabledInput } from '../html.js';

function channelCheckboxes(channels, selected = new Set()) {
  return channels.map(c => `<label class="ch-item"><input type="checkbox" name="channel_ids" value="${c.id}" ${selected.has(c.id) ? 'checked' : ''}><span>#${esc(c.name)}</span><span class="muted mono">(${c.id})</span>${c.canSend ? pill('送信可','ok') : pill('送信不可','err')}</label>`).join('') || '<div class="muted">チャンネル取得に失敗しました</div>';
}

export function registerTargetRoutes(app, { client, layout, guildChannels }) {
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
    const channels = await guildChannels();
    const body = `<div class="card"><div class="card-h"><div><p class="title">追加</p><div class="hint">X(RSS) / YouTube / Twitch は空欄OK。チャンネルは1つ以上必要です。</div></div></div><form method="post" action="/add"><div class="grid"><div class="field full"><label>状態</label>${enabledInput(true)}</div><div class="field full"><label>Discordチャンネル（複数選択）</label><div class="channels-box">${channelCheckboxes(channels)}</div></div><div class="field"><label>X(RSS)</label><input type="text" name="x_rss" placeholder="https://..." /></div><div class="field"><label>YouTube</label><input type="text" name="youtube" placeholder="channel_id / feed URL / channel URL / @handle / channel name" /></div><div class="field full"><label>Twitch</label><input type="text" name="twitch" placeholder="login (例: shroud)" /></div></div><div class="footer"><a class="btn btn-ghost" href="/list">戻る</a><button class="btn" type="submit">追加する</button></div></form></div>`;
    res.send(layout('追加', body, { active: 'add' }));
  });

  app.post('/add', (req, res) => {
    const ids = [].concat(req.body.channel_ids || []);
    try {
      insertTarget({ ...req.body, enabled: req.body.enabled ? 1 : 0, channel_ids: ids });
      res.redirect('/list');
    } catch (e) {
      res.status(400).send(layout('追加エラー', `<div class="errbox">${esc(e.message || 'add failed')}</div><div style="margin-top:10px"><a class="btn btn-ghost" href="/add">戻る</a></div>`, { active: 'add' }));
    }
  });

  app.get('/edit/:id', async (req, res) => {
    const target = getTargetById(Number(req.params.id));
    if (!target) return res.status(404).send(layout('not found', '<div class="errbox">not found</div>'));
    const selected = new Set(getChannelIdsByTargetId(target.id));
    const channels = await guildChannels();
    const body = `<div class="card"><div class="card-h"><div><p class="title">編集 ${pill(`#${target.id}`)}</p><div class="hint">保存するとチャンネル紐づけと各値が更新されます。</div></div><div class="right">${target.youtube ? `<a class="btn btn-ghost" href="/validate/youtube/${target.id}">YouTube検証</a>` : ''}</div></div><form method="post" action="/edit/${target.id}"><div class="grid"><div class="field full"><label>状態</label>${enabledInput(!!target.enabled)}</div><div class="field full"><label>Discordチャンネル（複数選択）</label><div class="channels-box">${channelCheckboxes(channels, selected)}</div></div><div class="field"><label>X(RSS)</label><input type="text" name="x_rss" value="${esc(target.x_rss)}" /></div><div class="field"><label>YouTube</label><input type="text" name="youtube" value="${esc(target.youtube)}" /></div><div class="field full"><label>Twitch</label><input type="text" name="twitch" value="${esc(target.twitch)}" /></div></div><div class="footer"><a class="btn btn-ghost" href="/list">戻る</a><button class="btn" type="submit">保存する</button></div></form></div>`;
    res.send(layout('編集', body, { active: 'list' }));
  });

  app.post('/edit/:id', (req, res) => {
    const ids = [].concat(req.body.channel_ids || []);
    try {
      updateTarget(Number(req.params.id), { ...req.body, enabled: req.body.enabled ? 1 : 0, channel_ids: ids });
      res.redirect('/list');
    } catch (e) {
      res.status(400).send(layout('編集エラー', `<div class="errbox">${esc(e.message || 'edit failed')}</div><div style="margin-top:10px"><a class="btn btn-ghost" href="/edit/${esc(req.params.id)}">戻る</a></div>`));
    }
  });

  app.post('/toggle/:id', (req, res) => {
    const target = getTargetById(Number(req.params.id));
    if (target) setTargetEnabled(target.id, target.enabled ? 0 : 1);
    res.redirect('/list');
  });

  app.post('/test/:id', async (req, res) => {
    const target = getTargetById(Number(req.params.id));
    if (!target) return res.status(404).send(layout('not found', '<div class="errbox">not found</div>'));
    const ids = getChannelIdsByTargetId(target.id);
    const content = formatNotificationContent('twitch', { targetId: target.id, title: 'テスト通知', url: 'https://example.com/test' });
    let sent = 0;
    for (const chId of ids) {
      const ch = await client.channels.fetch(chId).catch(() => null);
      if (!ch?.isTextBased()) continue;
      const perms = ch.permissionsFor?.(client.user);
      if (perms && !perms.has(PermissionFlagsBits.SendMessages)) continue;
      await ch.send({ content: `✅ Notify Bot テスト通知\n対象ID: #${target.id}\n${content}`, allowedMentions: { parse: [] } }).catch(() => null);
      sent++;
    }
    res.send(layout('テスト通知', `<div class="${sent ? 'okbox' : 'errbox'}">テスト通知を ${sent} チャンネルへ送信しました。</div><div style="margin-top:10px"><a class="btn btn-ghost" href="/list">戻る</a></div>`, { active: 'list' }));
  });

  app.get('/validate/youtube/:id', async (req, res) => {
    const target = getTargetById(Number(req.params.id));
    if (!target?.youtube) return res.status(404).send(layout('YouTube検証', '<div class="errbox">YouTube設定がありません。</div>'));
    const result = await validateYouTubeInput(target.youtube);
    const body = `<div class="card"><div class="card-h"><div><p class="title">YouTube検証 ${pill(`#${target.id}`)}</p><div class="hint">登録値をチャンネルID/RSSへ解決し、RSS取得を試します。</div></div></div><div class="grid"><div class="field full">${result.ok ? `<div class="okbox">✅ ${esc(result.message)}</div>` : `<div class="errbox">❌ ${esc(result.message)}</div>`}</div><div class="field"><label>RSS URL</label><div class="mono">${result.feedUrl ? esc(result.feedUrl) : '<span class="muted">—</span>'}</div></div><div class="field"><label>item数</label><div>${esc(result.itemCount ?? 0)}</div></div><div class="field full"><label>最新動画</label><div>${result.latestTitle ? `${esc(result.latestTitle)}<br><a href="${esc(result.latestUrl)}">${esc(result.latestUrl)}</a>` : '<span class="muted">—</span>'}</div></div><div class="field full"><label>診断</label><div class="mono">${(result.diagnostics || []).map(esc).join('<br>') || '<span class="muted">—</span>'}</div></div></div><div class="footer"><a class="btn btn-ghost" href="/list">戻る</a></div></div>`;
    res.send(layout('YouTube検証', body, { active: 'list' }));
  });

  app.post('/delete/:id', (req, res) => {
    deleteTarget(Number(req.params.id));
    res.redirect('/list');
  });
}
