/**
 * MO-ARK District Portal — API Client
 * All reads/writes go through the Cloudflare Worker.
 * The Worker talks to GitHub. The browser never touches GitHub directly.
 */

const API = (() => {
  const BASE = 'https://moark-portal-api.moarkkeyclubwebmaster.workers.dev';

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

  // ── NEWSLETTER SUBMISSIONS ───────────────────────────────────────────
  async function getAll()          { return req('GET',   '/submissions'); }
  async function getById(id)       { return req('GET',   `/submissions/${id}`); }
  async function create(data)      {
    // Client-side sanity. The Worker also validates, but failing fast here
    // gives a clearer message than a generic 400.
    if (!data || typeof data !== 'object') throw new Error('Invalid submission data.');
    if (!data.division || data.division < 1 || data.division > 10) throw new Error('Invalid division.');
    if (!data.ltgEmail || !data.ltgName) throw new Error('Missing submitter info.');
    if (!data.year || !data.month || !data.type) throw new Error('Missing year, month, or type.');
    if (!['newsletter','dc-report'].includes(data.type)) throw new Error('Invalid submission type.');
    if (!data.fileData || !data.fileData.startsWith('data:')) throw new Error('Missing or invalid PDF data.');
    if (!data.fileName) throw new Error('Missing file name.');
    return req('POST',  '/submissions', data);
  }
  async function update(id, data)  { return req('PATCH', `/submissions/${id}`, data); }

  async function getByDivision(division) {
    const all = await getAll();
    return all.filter(s => s.division === division);
  }
  async function addThreadMessage(id, message) { return update(id, { threadMessage: message }); }
  async function setStatus(id, status)         { return update(id, { status }); }
  async function setStatusWithMessage(id, status, message) { return update(id, { status, threadMessage: message }); }

  // ── DCM ENDPOINTS ────────────────────────────────────────────────────
  async function getDCMs()              { return req('GET',   '/dcm'); }
  async function getDCMById(id)         { return req('GET',   `/dcm/${id}`); }
  async function createDCM(data)        { return req('POST',  '/dcm', data); }
  async function updateDCM(id, data)    { return req('PATCH', `/dcm/${id}`, data); }

  async function getDCMsByDivision(division) {
    const all = await getDCMs();
    return all.filter(d => d.division === division).sort((a,b) => a.dcmNumber - b.dcmNumber);
  }

  // ── MRF ENDPOINTS ────────────────────────────────────────────────────
  async function getMRFs()              { return req('GET',   '/mrf'); }
  async function getMRFById(id)         { return req('GET',   `/mrf/${id}`); }
  async function createMRF(data)        { return req('POST',  '/mrf', data); }

  async function getMRFsByDivision(division) {
    const all = await getMRFs();
    return all.filter(m => m.division === division);
  }

  // ── COMMITTEE REPORT ENDPOINTS ───────────────────────────────────────
  async function getCommitteeReports()          { return req('GET',  '/committee'); }
  async function getCommitteeReportById(id)     { return req('GET',  `/committee/${id}`); }
  async function createCommitteeReport(data)    { return req('POST', '/committee', data); }

  async function getCommitteeReportsByUser(email) {
    const all = await getCommitteeReports();
    return all.filter(r => r.submitterEmail === email);
  }

  // ── DEADLINE LOGIC ───────────────────────────────────────────────────
  const NL_MONTHS   = ['May','September','October','November','December','January','February','March'];
  const ALL_MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTH_NUMS  = { January:0,February:1,March:2,April:3,May:4,June:5,July:6,August:7,September:8,October:9,November:10,December:11 };

  function getNextDeadline() {
    const now      = new Date();
    const curMonth = now.getMonth();
    const curYear  = now.getFullYear();
    for (const mName of NL_MONTHS) {
      const mNum = MONTH_NUMS[mName];
      let targetYear = curYear;
      if (mNum < 6 && curMonth >= 8) targetYear = curYear + 1;
      const deadline = new Date(targetYear, mNum, 10, 23, 59, 59);
      if (deadline > now) return { deadline, month: mName };
    }
    return null;
  }

  function getNextMRFDeadline() {
    const now  = new Date();
    const cur  = now.getMonth();
    const yr   = now.getFullYear();
    let d = new Date(yr, cur, 10, 23, 59, 59);
    if (d <= now) {
      const nm = cur === 11 ? 0 : cur + 1;
      const ny = cur === 11 ? yr + 1 : yr;
      d = new Date(ny, nm, 10, 23, 59, 59);
    }
    return { deadline: d, month: ALL_MONTHS[d.getMonth()] };
  }

  function getCurrentYears() { return ['2025-2026', '2026-2027']; }
  function getMonths()       { return NL_MONTHS; }
  function getAllMonths()     { return ALL_MONTHS; }
  function getMRFMonths()     { return ALL_MONTHS; }

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
    getDCMs, getDCMById, createDCM, updateDCM, getDCMsByDivision,
    getMRFs, getMRFById, createMRF, getMRFsByDivision,
    getCommitteeReports, getCommitteeReportById, createCommitteeReport, getCommitteeReportsByUser,
    getNextDeadline, getNextMRFDeadline, getCurrentYears, getMonths, getAllMonths, getMRFMonths, getStats,
  };
})();
