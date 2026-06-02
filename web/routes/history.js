import { getPostedHistory, deletePosted, cleanupPostedOlderThan } from '../../db.js';
import { esc, fmt, pill } from '../html.js';

export function registerHistoryRoutes(app, { layout }) {
  app.get('/history', (req, res) => {
    const rows = getPostedHistory({ limit: req.query.limit || 100 });
    const retention = Number(process.env.POSTED_RETENTION_DAYS || 0);
    const body = `<div class="card"><div class="card-h"><div><p class="title">投稿履歴</p><div class="hint">重複投稿防止に使っている履歴です。削除すると再通知される可能性があります。</div></div><div class="right"><form method="post" action="/history/cleanup"><input type="number" name="days" min="1" placeholder="日数" value="${retention || ''}"><button class="btn btn-danger" type="submit" onclick="return confirm('指定日数より古い履歴を削除しますか？')">古い履歴を削除</button></form></div></div><div style="overflow:auto"><table class="table"><tr><th>ID</th><th>対象</th><th>種別</th><th>タイトル</th><th>URL</th><th>公開日時</th><th>投稿日時</th><th>操作</th></tr>${rows.map(r => `<tr><td class="mono">${r.id}</td><td class="mono">#${r.target_id}</td><td>${pill(r.platform)}</td><td>${esc(r.item_title || '') || '<span class="muted">—</span>'}</td><td>${r.item_url ? `<a href="${esc(r.item_url)}">${esc(r.item_url)}</a>` : '<span class="muted">—</span>'}</td><td>${fmt(r.item_published_at)}</td><td>${fmt(r.posted_at)}</td><td><form method="post" action="/history/delete/${r.id}"><button class="btn btn-danger" type="submit" onclick="return confirm('履歴を削除しますか？再通知される可能性があります。')">削除</button></form></td></tr>`).join('') || '<tr><td colspan="8" class="muted">データなし</td></tr>'}</table></div></div>`;
    res.send(layout('投稿履歴', body, { active: 'history' }));
  });

  app.post('/history/delete/:id', (req, res) => {
    deletePosted(Number(req.params.id));
    res.redirect('/history');
  });

  app.post('/history/cleanup', (req, res) => {
    cleanupPostedOlderThan(req.body.days);
    res.redirect('/history');
  });
}
