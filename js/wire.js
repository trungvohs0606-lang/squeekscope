// The live wire to the WHEELY9000: /v1/status, polled politely with ETags.
// The API sends big numbers as strings and "unavailable" as a status, never as zero.

export function createApi(base) {
  const memo = new Map(); // path -> { etag, body, at }

  async function get(path, { minAgeMs = 1000, timeoutMs = 8000 } = {}) {
    const hit = memo.get(path);
    if (hit && Date.now() - hit.at < minAgeMs) return hit.body;
    const headers = {};
    if (hit?.etag) headers['If-None-Match'] = hit.etag;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(base + path, { headers, cache: 'no-store', signal: ctrl.signal });
      if (res.status === 304 && hit) {
        hit.at = Date.now();
        return hit.body;
      }
      if (!res.ok) throw new Error(`${path} answered HTTP ${res.status}`);
      const body = await res.json();
      memo.set(path, { etag: res.headers.get('etag'), body, at: Date.now() });
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  return { get };
}

const num = (v) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const time = (v) => {
  const t = Date.parse(String(v ?? ''));
  return Number.isFinite(t) ? t : null;
};

/**
 * Turn a /v1/status body into the "moon phase" of a reading.
 * phase: running | asleep | stale | fault | unknown
 */
export function readSky(status) {
  const m = status?.measurement;
  if (!m || typeof m !== 'object') return { phase: 'unknown' };
  const rpm = num(m.rpmMilli);
  const speed = num(m.speedMmPerSecond);
  const distance = num(m.distanceMm);
  const coreStatus = ['IDLE', 'ACTIVE', 'COUNTER_FAULT'].includes(m.coreStatus) ? m.coreStatus : null;
  const freshness = m.freshness === 'online' || m.freshness === 'stale' ? m.freshness : null;
  let phase = 'asleep';
  if (coreStatus === 'COUNTER_FAULT') phase = 'fault';
  else if (freshness === 'stale') phase = 'stale';
  else if (coreStatus === 'ACTIVE' || (rpm !== null && rpm > 0)) phase = 'running';
  else if (!coreStatus) phase = 'unknown';
  const anchor = status?.builder?.status === 'available' ? status.builder.anchor : null;
  return {
    phase,
    coreStatus,
    freshness,
    rpm: rpm === null ? null : rpm / 1000,
    metresPerSecond: speed === null ? null : speed / 1000,
    kmToday: distance === null ? null : distance / 1e6,
    observedAt: time(m.observedAt),
    receivedAt: time(m.receivedAt),
    settledThroughRound: /^\d+$/.test(String(anchor?.settledThroughRound ?? '')) ? BigInt(anchor.settledThroughRound) : null,
    settledAt: time(anchor?.confirmedAt),
  };
}
