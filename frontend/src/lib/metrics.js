// Shared, pure helpers — ported 1:1 from the HTML prototype so every page
// scores status, ageing and health the same way.

export const STATUSES = ['No progress', 'Requested', 'Under Review', 'Completed', 'NA'];

export const STATUS_STYLE = {
  'No progress': 'text-ink bg-fog border-tint',
  'Requested': 'text-ink bg-paper border-tint border-dashed',
  'Under Review': 'text-deep bg-tint border-tint',
  'Completed': 'text-green bg-paper border-green',
  'NA': 'text-slate-400 bg-paper border-tint',
};
export const QUERY_STYLE = 'text-deep bg-paper border-deep';

export const STATUS_RANK = { 'No progress': 0, 'Requested': 1, 'Under Review': 2, 'Completed': 3, 'NA': 3 };

export const ADHOC = { headId: 'adhoc', section: 'Z', sub: 'Ad-hoc' };
export const isAdhoc = (it) => it.headId === 'adhoc' || it.adhoc;
export const isAwaited = (it) => it.status === 'Requested' || it.queried;
export const owedToUs = (it) => it.headIncluded && it.requestable && (it.status === 'No progress' || it.status === 'Requested');

export function statusLabel(it) {
  if (it.status === 'NA') return 'N/A';
  if (it.status === 'Completed') return 'Complete';
  if (it.status === 'Under Review') return 'To review';
  if (it.status === 'Requested') return it.queried ? 'Queried' : 'Awaited';
  return it.requestable ? 'To request' : 'Not started';
}

export function statusOptions(it) {
  const o = [['No progress', it.requestable ? 'To request' : 'Not started']];
  if (it.requestable) o.push(['Requested', 'Awaited'], ['Queried', 'Queried']);
  o.push(['Under Review', 'To review'], ['Completed', 'Complete'], ['NA', 'N/A']);
  return o;
}

export const statusValue = (it) => (it.status === 'Requested' && it.queried ? 'Queried' : it.status);
export const statusStyle = (it) => (it.status === 'Requested' && it.queried ? QUERY_STYLE : STATUS_STYLE[it.status]);

// Local calendar date — the firm works in PKT; a UTC date would read "yesterday" until 5am.
const isoDay = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
export const today = () => isoDay(new Date());
export const daysBetween = (a, b) => (a ? Math.round((new Date(b) - new Date(a)) / 86400000) : null);
export const ageLabel = (days) => (days == null ? '—' : days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`);
export const fmtSize = (b) => (!b ? '' : b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');

export function normalizePhone(raw) {
  if (!raw) return '';
  let d = raw.replace(/[^\d]/g, '');
  if (d.startsWith('0')) d = '92' + d.slice(1);
  if (d.startsWith('92')) return d;
  if (d.length === 10) return '92' + d;
  return d;
}

// Applies a status change the same way the reducer used to: tracks statusSince/peak so
// ageing (noProgressDays) resets only on real forward progress, not on every click.
export function withStatus(it, v) {
  const peak = it.peak ?? (STATUS_RANK[it.status] ?? 0);
  if (v === 'Queried') {
    if (it.status === 'Requested' && it.queried) return {};
    return { status: 'Requested', queried: true, dateQueried: today(), dateRequested: it.dateRequested || today(), statusSince: today(), peak: 1 };
  }
  if (v === it.status) {
    return it.status === 'Requested' && it.queried ? { queried: false, peak } : {};
  }
  const rank = STATUS_RANK[v] ?? 0;
  const reopen = it.status === 'Completed' || it.status === 'NA';
  const patch = { status: v, peak };
  if (reopen || rank > peak) {
    patch.statusSince = today();
    patch.peak = rank;
  }
  if (v === 'Requested') {
    patch.queried = false;
    if (!it.dateRequested) patch.dateRequested = today();
  }
  if (v === 'Under Review' && !it.dateReceived) patch.dateReceived = today();
  if (v === 'Under Review' || v === 'Completed') patch.queried = false;
  return patch;
}

// ---- Flags: watch >=3d, flag >=10d, urgent >=14d without progress, or past its own due date ----
export const FLAG_DAYS = { watch: 3, flag: 10, urgent: 14 };
export const RANK = { watch: 1, flag: 2, urgent: 3 };
export const TIER_STYLE = {
  watch: { dot: 'bg-tint', text: 'text-slate-600', badge: 'text-slate-600 bg-fog border-tint' },
  flag: { dot: 'bg-green', text: 'text-green', badge: 'text-green bg-paper border-green' },
  urgent: { dot: 'bg-deep', text: 'text-deep font-medium', badge: 'text-deep bg-paper border-deep font-medium' },
};

export const noProgressDays = (it) => (!it.headIncluded || it.status === 'Completed' || it.status === 'NA') ? null : daysBetween(it.statusSince, today());

export function progressTier(it) {
  const d = noProgressDays(it);
  if (d == null) return null;
  let tier = d >= FLAG_DAYS.urgent ? 'urgent' : d >= FLAG_DAYS.flag ? 'flag' : d >= FLAG_DAYS.watch ? 'watch' : null;
  if (it.due && it.due < today()) {
    const over = daysBetween(it.due, today());
    const ot = over >= 7 ? 'urgent' : 'flag';
    if (!tier || RANK[ot] > RANK[tier]) tier = ot;
  }
  return tier;
}

export function deadlineTier(e, pct) {
  if (!e.deadline || pct === 100) return null;
  const left = daysBetween(today(), e.deadline);
  if (left == null) return null;
  return left < 0 ? 'urgent' : left <= 7 ? 'flag' : left <= 14 ? 'watch' : null;
}

// Engagement-level metrics, computed from its items (headIncluded scope already applied).
export function engMetrics(e, inboxFiles = []) {
  const items = e.items || [];
  const incl = items.filter((it) => it.headIncluded && it.status !== 'NA');
  const done = incl.filter((it) => it.status === 'Completed').length;
  const total = incl.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const reqItems = incl.filter((it) => it.requestable);
  const outstanding = reqItems.filter((it) => isAwaited(it));
  const ages = outstanding.map((it) => daysBetween(it.dateRequested, today())).filter((d) => d != null);
  const oldest = ages.length ? Math.max(...ages) : null;
  const queries = incl.filter((it) => it.queried).length;
  const review = incl.filter((it) => it.status === 'Under Review').length;
  const adhocOpen = incl.filter((it) => isAdhoc(it) && it.status !== 'Completed').length;
  let worst = null;
  for (const it of incl) {
    const t = progressTier(it);
    if (t && (!worst || RANK[t] > RANK[worst])) worst = t;
  }
  const dt = deadlineTier(e, pct);
  if (dt && (!worst || RANK[dt] > RANK[worst])) worst = dt;
  const daysLeft = e.deadline ? daysBetween(today(), e.deadline) : null;
  const files = (inboxFiles || []).filter((f) => !f.assignedItemId).length;
  return { total, done, pct, outstandingCount: outstanding.length, oldest, queries, reqTotal: reqItems.length, review, adhocOpen, worst, daysLeft, files };
}

export function healthOf(m) {
  if (m.pct === 100) return { label: 'Complete', cls: 'text-green bg-paper border-green' };
  if (m.daysLeft != null && m.daysLeft < 0) return { label: 'Overdue', cls: TIER_STYLE.urgent.badge };
  if (m.worst === 'urgent') return { label: 'Stalled', cls: TIER_STYLE.urgent.badge };
  if (m.worst === 'flag') return { label: 'At risk', cls: TIER_STYLE.flag.badge };
  if (m.worst === 'watch') return { label: 'Watch', cls: TIER_STYLE.watch.badge };
  return { label: 'On track', cls: 'text-slate-500 bg-fog border-tint' };
}

export const SECTION_NAMES = {
  A: 'A · Permanent File',
  B: 'B · Planning File',
  C: 'C · General Procedures',
  D: 'D · Head-Wise Audit',
};
export const sectionLabel = (sec) => (sec === ADHOC.section ? ADHOC.sub : SECTION_NAMES[sec] || sec);

const engWord = (mod) => (mod || 'audit') === 'audit' ? 'the audit of' : `the ${mod} engagement of`;

// The message writes itself: never-asked items become a request, awaited ones a reminder,
// queried ones a resend — one text, grouped by heading.
export function composeMessage(engagement, client, items) {
  const usable = items.filter((it) => it.requestable && it.headIncluded && it.status !== 'Completed' && it.status !== 'NA' && it.status !== 'Under Review');
  const fresh = usable.filter((it) => it.status === 'No progress');
  const awaited = usable.filter((it) => it.status === 'Requested' && !it.queried);
  const resend = usable.filter((it) => it.status === 'Requested' && it.queried);
  const list = (its) => {
    const byHead = {};
    for (const it of its) (byHead[it.sub] = byHead[it.sub] || []).push(it);
    const heads = Object.keys(byHead);
    let s = '';
    for (const h of heads) {
      if (heads.length > 1) s += `_${h}_\n`;
      for (const it of byHead[h]) s += `• ${it.p}\n`;
    }
    return s;
  };
  let text = `Assalam-o-Alaikum${client?.contactName ? ' ' + client.contactName : ''},\n\n`;
  text += `Regarding ${engWord(engagement.module)} ${client?.name || ''} (FY ${engagement.year}):\n`;
  if (fresh.length) text += `\n*We require the following:*\n` + list(fresh);
  if (awaited.length) text += `\n*Still awaited — a gentle reminder:*\n` + list(awaited);
  if (resend.length) text += `\n*Please resend — the versions received appear incorrect or incomplete:*\n` + list(resend);
  text += `\nKindly share at your earliest convenience. JazakAllah.`;
  return { text, fresh, awaited, resend, skipped: items.length - usable.length };
}

// What sending does to each item — new requests become Requested, reminders/resends get a followup tick.
export function afterSend(items, msg) {
  const fresh = new Set(msg.fresh.map((i) => i.id));
  const rem = new Set([...msg.awaited, ...msg.resend].map((i) => i.id));
  const td = today();
  return items.map((it) => fresh.has(it.id)
    ? { id: it.id, patch: { status: 'Requested', dateRequested: it.dateRequested || td, statusSince: td, peak: 1, lastContact: td } }
    : rem.has(it.id)
      ? { id: it.id, patch: { followups: (it.followups || 0) + 1, lastContact: td } }
      : null).filter(Boolean);
}
