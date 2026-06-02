import { getDashboardStats, getTargetStatuses } from '../../db.js';
import { fmt, pill, esc } from '../html.js';

export function registerDashboardRoutes(app, { layout }) {
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
}
