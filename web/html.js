export const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export const fmt = (v) => v
  ? esc(new Date(v).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }))
  : '<span class="muted">—</span>';

export const pill = (text, cls = '') => `<span class="pill ${esc(cls)}">${esc(text)}</span>`;

export function platformLabels(target) {
  return [
    target.x_rss ? 'x_rss' : null,
    target.youtube ? 'youtube' : null,
    target.twitch ? 'twitch' : null
  ].filter(Boolean);
}

export function statusHtml(target, statusMap) {
  const platforms = platformLabels(target);
  const statuses = platforms.map(p => statusMap.get(`${target.id}:${p}`));
  if (statuses.length === 0 || statuses.every(s => !s)) return '<span class="muted">未チェック</span>';

  return statuses.map((s, idx) => {
    const platform = platforms[idx];
    if (!s) return `${pill(platform, 'warn')} <span class="muted">未チェック</span>`;
    const failing = s.last_error_at && (!s.last_success_at || s.last_error_at > s.last_success_at);
    const statusText = failing ? esc(s.last_error_message || 'エラー') : '正常';
    return `${pill(platform, failing ? 'err' : 'ok')} ${statusText}<br><span class="muted">最終: ${fmt(s.last_checked_at)}</span>`;
  }).join('<br>');
}

export function enabledInput(checked = true) {
  return `<label class="ch-item"><input type="checkbox" name="enabled" value="1" ${checked ? 'checked' : ''}><span>この対象を有効にする</span></label>`;
}
