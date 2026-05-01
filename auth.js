/**
 * MO-ARK District Portal — Auth Module
 * Credentials live here. Keep this repo PRIVATE on GitHub.
 * To change a password: update the value in USERS below.
 * Passwords are stored as plain strings — this is acceptable
 * because the repo is private and this is a low-stakes internal tool.
 * If you want stronger security later, replace with bcrypt hashes.
 */

const AUTH = (() => {

  // ── USER DATABASE ────────────────────────────────────────────────────
  // role: 'ltg' | 'editor' | 'governor' | 'treasurer' | 'secretary' | 'webmaster'
  // division: only for LTGs (1-10)
  // name: display name shown in the portal
const USERS = [
    // ── LTGs ──
    { email: 'moarkkcltg1@gmail.com',      password: 'ServeFirst_Div1',      role: 'ltg', division: 1,  name: 'Division 1 LTG' },
    { email: 'moarkkcltg002@gmail.com',    password: 'OneFamily_Div2',       role: 'ltg', division: 2,  name: 'Division 2 LTG' },
    { email: 'moarkkeyclubltg3@gmail.com', password: 'BuildBetter_Div3',     role: 'ltg', division: 3,  name: 'Division 3 LTG' },
    { email: 'moarkkcltg04@gmail.com',     password: 'LeadWithHeart4',       role: 'ltg', division: 4,  name: 'Division 4 LTG' },
    { email: 'moarkkcltg05@gmail.com',     password: 'RiseAndServe5',        role: 'ltg', division: 5,  name: 'Division 5 LTG' },
    { email: 'moarkkcltg06@gmail.com',     password: 'SixStrong_KC6',        role: 'ltg', division: 6,  name: 'Division 6 LTG' },
    { email: 'moarkkcltg007@gmail.com',    password: 'CareActLead_7',        role: 'ltg', division: 7,  name: 'Division 7 LTG' },
    { email: 'moarkkcltg08@gmail.com',     password: 'Div8_ServiceAboveAll', role: 'ltg', division: 8,  name: 'Division 8 LTG' },
    { email: 'moarkkcltg9@gmail.com',      password: 'NineForService',       role: 'ltg', division: 9,  name: 'Division 9 LTG' },
    { email: 'moarkkcltg010@gmail.com',    password: 'Div10_MakeADiff',      role: 'ltg', division: 10, name: 'Division 10 LTG' },
    // ── Board ──
    { email: 'moarkkeyclubgovernor@gmail.com',  password: 'govpass1',  role: 'governor',  division: null, name: 'District Governor' },
    { email: 'momoarkkctreasurer@gmail.com',    password: 'trspass1',  role: 'treasurer', division: null, name: 'District Treasurer' },
    { email: 'moarkkcsecretarry@gmail.com',     password: 'secpass1',  role: 'secretary', division: null, name: 'District Secretary' },
    { email: 'moarkkeyclubwebmaster@gmail.com', password: 'webpass1',  role: 'webmaster', division: null, name: 'Webmaster' },
    { email: 'moarkkeditor1@gmail.com',         password: 'edtpass1',  role: 'editor',    division: null, name: 'District Editor' },
  ];
  // ── SESSION ──────────────────────────────────────────────────────────
  const SESSION_KEY = 'moark_portal_user';

  function login(email, password) {
    const user = USERS.find(u => u.email === email && u.password === password);
    if (!user) return null;
    const session = { email: user.email, role: user.role, division: user.division, name: user.name };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getUser() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  async function logout() {
    // Fire log before clearing session so actor is still known
    try {
      const u = getUser();
      if (u) {
        await fetch('https://moark-portal-api.moarkkeyclubwebmaster.workers.dev/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actor:     u.email,
            actorName: u.name,
            actorRole: u.role,
            actorDiv:  u.division || null,
            action:    'LOGOUT',
            detail:    'Signed out of portal',
          }),
        });
      }
    } catch(e) { /* silent */ }
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = 'index.html';
  }

  // Role checks
  function isLTG()       { const u = getUser(); return u && u.role === 'ltg'; }
  function isEditor()    { const u = getUser(); return u && u.role === 'editor'; }
  function isGovernor()  { const u = getUser(); return u && u.role === 'governor'; }
  function isWebmaster() { const u = getUser(); return u && u.role === 'webmaster'; }
  function isTreasurer() { const u = getUser(); return u && u.role === 'treasurer'; }
  function isSecretary() { const u = getUser(); return u && u.role === 'secretary'; }

  // Can review/approve (editor, webmaster)
  function canReview() {
    const u = getUser();
    return u && ['editor', 'webmaster'].includes(u.role);
  }

  // Can see all submissions (everyone except LTG sees all; LTG sees own)
  function canSeeAll() {
    const u = getUser();
    return u && ['editor', 'webmaster', 'governor', 'treasurer', 'secretary'].includes(u.role);
  }

  // Require login — call at top of every protected page
  function requireAuth() {
    if (!getUser()) window.location.href = 'index.html';
    return getUser();
  }

  // ── CONSOLE ACCESS ───────────────────────────────────────────────────
  // Secondary passwords for the Admin Console — separate from portal login.
  // Only webmaster, editor, and governor can access console.
  const CONSOLE_PASSWORDS = {
    webmaster: 'keyclub4life',
    editor:    'serviceispower',
    governor:  'moarkdistrict',
  };

  function canAccessConsole() {
    const u = getUser();
    return u && ['webmaster', 'editor', 'governor'].includes(u.role);
  }

  function verifyConsolePassword(password) {
    const u = getUser();
    if (!u || !CONSOLE_PASSWORDS[u.role]) return false;
    return password === CONSOLE_PASSWORDS[u.role];
  }

  return { login, getUser, logout, isLTG, isEditor, isGovernor, isWebmaster, isTreasurer, isSecretary, canReview, canSeeAll, requireAuth, canAccessConsole, verifyConsolePassword };
})();