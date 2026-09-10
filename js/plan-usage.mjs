import { registerPlanCopy } from './plan-copy.mjs?v=plans1';

export function formatCallTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function formatBytes(bytes) {
  return Number(bytes) >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(Math.max(0, Number(bytes || 0)) / 1e6).toFixed(1)} MB`;
}

if (typeof window !== 'undefined' && window.LegaryaAuthApi) {
  registerPlanCopy(window.LegaryaI18n);
  const t = (key, args) => window.LegaryaI18n?.t(key, args) || key.replace(/\{(\d+)\}/g, (_, i) => args?.[i] ?? '');
  const bytes = value => formatBytes(value).replace('MB', t('MB')).replace('GB', t('GB'));
  const make = (tag, text, className) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; };
  const trigger = make('button', t('Plans & usage'), 'plan-launcher'); trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'dialog');
  const host = document.querySelector('.gateway-header, .chat-header');
  host?.append(trigger);
  const dialog = make('dialog', null, 'plan-dialog'); dialog.setAttribute('aria-labelledby', 'planTitle');
  const heading = make('header'), title = make('h2', t('Plans & usage')); title.id = 'planTitle';
  const close = make('button', '×', 'plan-close'); close.type = 'button'; close.setAttribute('aria-label', t('Close'));
  heading.append(title, close);
  const content = make('div', null, 'plan-content');
  const footer = make('footer'), refreshButton = make('button', t('Refresh usage')); refreshButton.type = 'button'; footer.append(refreshButton);
  dialog.append(heading, content, footer); document.body.append(dialog);
  const notice = make('p', null, 'plan-notice'); notice.setAttribute('role', 'status'); notice.hidden = true; host?.after(notice);
  let snapshot = null, loading = false, retired = false, noticeTimer;
  const line = (label, meter, format = String) => {
    const row = make('div', null, 'plan-meter'); const top = make('div');
    top.append(make('span', t(label)), make('strong', meter.limit == null ? t('Unlimited') : t('{0} of {1} used', [format(meter.used), format(meter.limit)])));
    row.append(top);
    if (meter.limit != null) { const progress = make('progress'); progress.max = meter.limit || 1; progress.value = Math.min(meter.limit, meter.used + (meter.reserved || 0)); progress.setAttribute('aria-label', t(label)); row.append(progress); }
    if (meter.reserved) row.append(make('small', t('{0} pending', [format(meter.reserved)])));
    return row;
  };
  function render() {
    if (!snapshot) return;
    content.replaceChildren();
    const current = make('p', null, 'plan-current'); current.append(make('span', t('Current plan')), make('strong', t(snapshot.plan === 'plus' ? 'Plus' : snapshot.plan === 'pro' ? 'Pro' : 'Free'))); content.append(current);
    if (snapshot.quota_exempt) content.append(make('p', t('Unlimited testing access'), 'plan-highlight'));
    if (!snapshot.enforcement_enabled) content.append(make('p', t('Usage tracking only; limits are not active.')));
    for (const [mode, label] of [['rya','Build with Rya'],['legacy','Talk with a Legacy']]) {
      const section = make('section'); section.append(make('h3', t(label)), line('Messages', snapshot.daily[mode+'_text']), line('Call time', snapshot.daily[mode+'_voice_ms'], formatCallTime)); content.append(section);
    }
    content.append(make('p', t('Daily allowances are separate for each experience. They reset at midnight UTC.')));
    const reset = new Date(snapshot.resets_at); content.append(make('p', t('Next reset: {0}', [reset.toLocaleString(window.LegaryaI18n?.language || 'en', {hour12:false,timeZoneName:'short'})])));
    content.append(make('p', t('Call time includes listening and pauses, not connection setup.')));
    content.append(line('Owned Legacies', snapshot.capacity.owned_legacies), line('Uploaded storage', {...snapshot.capacity.storage_bytes, reserved:snapshot.storage_reserved_bytes}, bytes));
    content.append(make('p', t('Storage includes collaborator uploads and pending uploads. Existing content stays accessible.')));
    content.append(make('h3', t('Plan allowances')));
    const cards = make('div', null, 'plan-tiers');
    for (const [name, messages, minutes, legacies, storage] of [['Free',40,1,1,'100 MB'],['Plus',120,3,3,'1 GB'],['Pro',400,10,10,'5 GB']]) {
      const card = make('section'); card.append(make('h4', t(name)), make('p', t('{0} messages and {1} call minutes daily per experience', [messages,minutes])), make('p', t('{0} Legacies · {1} storage', [legacies,storage.replace('MB', t('MB')).replace('GB', t('GB'))]))); cards.append(card);
    }
    content.append(cards, make('p', t('Paid plans are not available yet. Prices have not been set.')));
    const mode = location.pathname.endsWith('legacy-chat.html') ? 'legacy' : 'rya';
    trigger.replaceChildren(make('span', t('Usage')), make('small', snapshot.quota_exempt ? t('Unlimited') : t('{0} messages left', [snapshot.daily[mode+'_text'].remaining])));
    trigger.setAttribute('aria-label', t('Plans & usage'));
  }
  async function refresh() {
    if (loading || retired || document.hidden || window.LegaryaAuthApi.hasAuthenticatedSession?.() === false) return;
    const epoch = window.LegaryaAuthApi.getSessionEpoch?.(); loading = true; refreshButton.disabled = true;
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const value = await window.LegaryaAuthApi.apiRequest('/plans/usage', {authenticated:true, signal:controller.signal});
      if (retired || epoch !== window.LegaryaAuthApi.getSessionEpoch?.()) return;
      snapshot = value; render();
    } catch {
      if (!retired) { snapshot = null; trigger.textContent = t('Plans & usage'); content.replaceChildren(make('p', t('Usage is temporarily unavailable. Try refreshing.'), 'plan-error')); }
    } finally { clearTimeout(timeout); loading = false; refreshButton.disabled = false; }
  }
  trigger.addEventListener('click', () => { dialog.showModal(); if (!snapshot) content.textContent = t('Loading usage…'); void refresh(); });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => trigger.focus());
  refreshButton.addEventListener('click', refresh);
  window.addEventListener('legarya:plan-limit', event => {
    if (retired) return;
    notice.textContent = t(event.detail?.message || 'Usage is temporarily unavailable. Try refreshing.'); notice.hidden = false;
    clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice.hidden = true; }, 15000); void refresh();
  });
  window.addEventListener('legarya:usage-changed', () => { setTimeout(refresh, 750); });
  window.addEventListener('legarya:language-change', () => { title.textContent = t('Plans & usage'); refreshButton.textContent = t('Refresh usage'); close.setAttribute('aria-label', t('Close')); render(); });
  // Optional reads never gate chat, call startup, or a user's ability to retry.
  let poll = setInterval(refresh, 30000);
  window.addEventListener('legarya:session-ending', () => { retired = true; snapshot = null; clearInterval(poll); clearTimeout(noticeTimer); dialog.close(); content.replaceChildren(); notice.hidden = true; trigger.textContent = t('Plans & usage'); });
  // Bootstrap may legitimately announce a new session. Start after page auth.
  const boot = () => { retired = false; clearInterval(poll); poll = setInterval(refresh, 30000); setTimeout(refresh, 0); };
  window.addEventListener('legarya:session-ready', boot);
  setTimeout(refresh, 1500);
}
