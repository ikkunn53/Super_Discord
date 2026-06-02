function truncate(value, max = 1800) {
  const s = String(value ?? '');
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function fillTemplate(template, values) {
  return truncate(String(template).replace(/\{(url|title|platform|targetId|login)\}/g, (_, key) => values[key] ?? ''));
}

export function formatNotificationContent(platform, { url, title = '', targetId = '', login = '' } = {}) {
  const envKey = `NOTIFY_TEMPLATE_${platform.toUpperCase()}`;
  const template = process.env[envKey];
  if (template && template.trim()) {
    return fillTemplate(template, { url, title, platform, targetId, login });
  }

  if (platform === 'twitch') {
    const safeTitle = String(title ?? '').trim();
    return safeTitle ? `🔴 Twitch 配信開始\n${safeTitle}\n${url}` : `<${url}>`;
  }

  return String(url ?? '');
}
