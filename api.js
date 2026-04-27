/**
 * MO-ARK District Portal — API Client
 * Replaces data.js. All reads/writes go through the Cloudflare Worker.
 * The Worker talks to GitHub. The browser never touches GitHub directly.
 */

const API = (() => {
  const BASE = 'https://moark-portal-api.moarkkeyclubwebmaster.workers.dev';
  const PDF_BASE = BASE; // PDFs served via Worker proxy at /pdf/:id

  // ── CORE FETCH ───────────────────────────────────────────────────────
  async function req(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Request failed: ${res.status}`);
    }
    return res.json();
  }

  // ── SUBMISSIONS ──────────────────────────────────────────────────────
  async function getAll()          { return req('GET',   '/submissions'); }
  async function getById(id)       { return req('GET',   `/submissions/${id}`); }
  async function create(data)      { return req('POST',  '/submissions', data); }
  async function update(id, data)  { return req('PATCH', `/submissions/${id}`, data); }

  // ── CONVENIENCE ──────────────────────────────────────────────────────
  async function getByDivision(division) {
    const all = await getAll();
    return all.filter(s => s.division === division);
  }

  async function addThreadMessage(id, message) {
    return update(id, { threadMessage: message });
  }

  async function setStatus(id, status) {
    return update(id, { status });
  }

  async function setStatusWithMessage(id, status, message) {
    return update(id, { status, threadMessage: message });
  }

  // ── DEADLINE LOGIC ───────────────────────────────────────────────────
  // School year: May, September–March (no April, no June/July/August)
  // Order starts with May (current month), then wraps to Sep–Mar
  const ACTIVE_MONTHS = ['May','September','October','November','December','January','February','March'];
  const MONTH_NUMS = { January:0,February:1,March:2,April:3,May:4,June:5,July:6,August:7,September:8,October:9,November:10,December:11 };

  function getNextDeadline() {
    const now = new Date();
    const curMonth = now.getMonth(); // 0-indexed
    const curYear  = now.getFullYear();

    for (const mName of ACTIVE_MONTHS) {
      const mNum = MONTH_NUMS[mName];
      let targetYear = curYear;

      // Jan–May are in the new calendar year relative to a Sep-start school year
      if (mNum < 6 && curMonth >= 8) targetYear = curYear + 1;

      const deadline = new Date(targetYear, mNum, 10, 23, 59, 59);
      if (deadline > now) return { deadline, month: mName };
    }
    return null;
  }

  function getCurrentYears() { return ['2025-2026', '2026-2027']; }
  function getMonths()       { return ACTIVE_MONTHS; }

  async function getStats(division = null) {
    const all = division ? await getByDivision(division) : await getAll();
    return {
      total:            all.length,
      pendingEditor:    all.filter(s => s.status === 'pending-editor').length,
      pendingWebmaster: all.filter(s => s.status === 'pending-webmaster').length,
      approved:         all.filter(s => s.status === 'approved').length,
      denied:           all.filter(s => s.status === 'denied').length,
    };
  }

  return {
    getAll, getById, create, update,
    getByDivision, addThreadMessage, setStatus, setStatusWithMessage,
    getNextDeadline, getCurrentYears, getMonths, getStats,
  };
})();