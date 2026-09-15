/**
 * MO-ARK District Officer Portal - Shared runtime
 * ===========================================================================
 * ONE file, loaded on every page, that provides:
 *   • OFFICERS  - the roster (names, photos, divisions, regions)
 *   • PORTAL    - greeting engine, per-officer stats, toast helper
 *   • the shared top navigation (built once, identical on every page)
 *
 * Load order per page:  auth.js → api.js → logger.js → portal.js → page code
 * On the login page:     portal.js → auth.js   (so OFFICERS exists at login)
 *
 * ▶ TO ADD REAL NAMES / PHOTOS / REGIONS: edit ROSTER below. That's it -
 *   the greeting, nav avatar, profile page, and the name saved on every
 *   submission all read from here.
 * ===========================================================================
 */

/* ─────────────────────────────────────────────────────────────────────────
   OFFICER ROSTER
   ───────────────────────────────────────────────────────────────────────── */
const OFFICERS = (() => {
  // key = login email (lowercase)
  //   name   : real name (shows in greeting + recorded on submissions)
  //   photo  : "photos/div1.jpg" or a URL - leave "" for initials avatar
  //   region : what the division covers (shown on profile as the "meaning")
  const ROSTER = {
    // -- Lieutenant Governors --
    'moarkkcltg1@gmail.com':        { name: 'Savanna Scruggs',         role: 'ltg', division: 1,  photo: 'assets/ltg1.jpeg',  region: '' },
    'moarkkcltg002@gmail.com':      { name: 'Pritam Avuthu',           role: 'ltg', division: 2,  photo: 'assets/ltg2.jpeg',  region: '' },
    'moarkkeyclubltg3@gmail.com':   { name: 'Mary Ann Gingerich',      role: 'ltg', division: 3,  photo: 'assets/ltg3.jpeg',  region: '' },
    'moarkeyclubltg04@gmail.com':   { name: 'Division 4 LTG',          role: 'ltg', division: 4,  photo: '', region: '', vacant: true },
    'moarkkcltg05@gmail.com':       { name: 'Makenlei Shafferkoetter', role: 'ltg', division: 5,  photo: 'assets/ltg5.jpeg',  region: '' },
    'moarkkcltg6@gmail.com':        { name: 'Ava Long',                role: 'ltg', division: 6,  photo: 'assets/ltg6.jpeg',  region: '' },
    'moarkkcltg007@gmail.com':      { name: 'Division 7 LTG',          role: 'ltg', division: 7,  photo: '', region: '', vacant: true },
    'moarkkcltg08@gmail.com':       { name: 'Andy Santizo',            role: 'ltg', division: 8,  photo: 'assets/ltg8.jpeg',  region: '' },
    'moarkkcltg9@gmail.com':        { name: 'Amara Miles',             role: 'ltg', division: 9,  photo: 'assets/ltg9.jpeg',  region: '' },
    'moarkkcltg010@gmail.com':      { name: 'Tanvi Narendhula',        role: 'ltg', division: 10, photo: 'assets/ltg10.jpeg', region: '' },
    // -- District Board (order of authority: Governor, Secretary, Treasurer, Webmaster, Editor) --
    'moarkkeyclubgovernor@gmail.com':  { name: 'Dakota Menning',     role: 'governor',  division: null, photo: 'assets/governor.png',  title: 'District Governor' },
    'moarkkcsecretary@gmail.com':      { name: 'Omar Vargas Garcia', role: 'secretary', division: null, photo: 'assets/secretary.png', title: 'District Secretary' },
    'momoarkkctreasurer@gmail.com':    { name: 'Abraham Ireland',    role: 'treasurer', division: null, photo: 'assets/treasurer.png', title: 'District Treasurer' },
    'moarkkeyclubwebmaster@gmail.com': { name: 'Rahul Awasthi',      role: 'webmaster', division: null, photo: 'assets/webmaster.png', title: 'District Webmaster' },
    'moarkkeditor1@gmail.com':         { name: 'Nandu Rakesh Nair',  role: 'editor',    division: null, photo: 'assets/editor.png',    title: 'District Editor' },
  };

  const ROLE_TITLES = {
    ltg: 'Lieutenant Governor', editor: 'District Editor', governor: 'District Governor',
    treasurer: 'District Treasurer', secretary: 'District Secretary', webmaster: 'District Webmaster',
  };

  const isPlaceholder = n => /^division\s+\d+\s+ltg$/i.test((n || '').trim());

  function get(email) { return email ? (ROSTER[email.toLowerCase()] || null) : null; }

  function forSession(session) {
    if (!session) return null;
    const rec = get(session.email) || {};
    const name = rec.name || session.name || 'Officer';
    const division = (rec.division !== undefined ? rec.division : session.division) || null;
    const photo = rec.photo || '';
    return {
      email: session.email, role: session.role, division, name,
      firstName: firstNameOf(name),
      photo,
      region: rec.region || '',
      title: rec.title || roleTitle(session.role, division),
    };
  }

  function firstNameOf(name) {
    if (!name) return 'there';
    if (isPlaceholder(name)) return 'Div ' + name.match(/\d+/)[0];
    return name.trim().split(/\s+/)[0];
  }
  function roleTitle(role, division) {
    if (role === 'ltg') return division ? `Lieutenant Governor · Division ${division}` : 'Lieutenant Governor';
    return ROLE_TITLES[role] || (role ? role[0].toUpperCase() + role.slice(1) : 'Officer');
  }
  function initials(name) {
    if (!name) return '?';
    if (isPlaceholder(name)) return name.match(/\d+/)[0];
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
  }
  function avatarInner(officer) {
    if (officer && officer.photo) return `<img src="${officer.photo}" alt="">`;
    return initials(officer ? officer.name : '');
  }

  return { ROSTER, get, forSession, roleTitle, firstNameOf, initials, avatarInner };
})();

/* ─────────────────────────────────────────────────────────────────────────
   PORTAL - greeting, stats, toast
   ───────────────────────────────────────────────────────────────────────── */
const PORTAL = (() => {
  const TIME = {
    morning:   ['Good morning, {name}', 'Rise and serve, {name}', 'Fresh start, {name}'],
    afternoon: ['Good afternoon, {name}', 'Hope the day’s treating you well, {name}'],
    evening:   ['Good evening, {name}', 'Winding down, {name}?'],
    night:     ['Working late, {name}?', 'Burning the midnight oil, {name}?'],
  };
  const ANY = [
    'Welcome back, {name}', 'Great to see you, {name}', 'Ready to serve, {name}?',
    'Caring - our way of life, {name}', 'Let’s build a better district, {name}',
    'Service above self, {name}', 'Lead the way, {name}',
    'The district’s in good hands, {name}', 'Onward, {name}',
    'Let’s make it count, {name}', 'Another day of service, {name}',
    'Key Club looks good on you, {name}',
  ];
  const bucket = h => h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 22 ? 'evening' : 'night';

  function greeting(firstName, date = new Date()) {
    const safe = firstName || 'there';
    const pool = [...TIME[bucket(date.getHours())], ...ANY];
    return pool[Math.floor(Math.random() * pool.length)].replace('{name}', `<em>${safe}</em>`);
  }

  function statsFor(officer, { subs = [], dcms = [], mrfs = [], committees = [] } = {}) {
    const isLTG = officer.role === 'ltg';
    const mine = arr => isLTG ? arr.filter(x => x.division === officer.division) : arr;
    const mySubs = isLTG ? subs.filter(s => s.division === officer.division)
                         : subs.filter(s => (s.ltgEmail || '').toLowerCase() === officer.email.toLowerCase());
    const myComm = committees.filter(c => (c.submitterEmail || '').toLowerCase() === officer.email.toLowerCase());
    return {
      newslettersApproved: mySubs.filter(s => s.type !== 'dc-report' && s.status === 'approved').length,
      newslettersTotal:    mySubs.filter(s => s.type !== 'dc-report').length,
      dcReports:           mySubs.filter(s => s.type === 'dc-report' && s.status === 'approved').length,
      dcmsReported:        mine(dcms).filter(d => d.reportStatus === 'submitted').length,
      dcmsScheduled:       mine(dcms).filter(d => d.status !== 'unscheduled').length,
      mrfs:                mine(mrfs).length,
      committeeReports:    myComm.length,
    };
  }

  function toast(msg, type = 'info') {
    let host = document.querySelector('.toast-host');
    if (!host) { host = document.createElement('div'); host.className = 'toast-host'; document.body.appendChild(host); }
    const bg = type === 'success' ? '#12643A' : type === 'error' ? '#9B1C1C' : '#0B1B33';
    const t = document.createElement('div');
    t.style.cssText = `padding:.8rem 1.15rem;background:${bg};color:#fff;border-radius:12px;font-size:.875rem;font-weight:600;box-shadow:0 8px 26px rgba(0,0,0,.25);opacity:0;transform:translateY(10px);transition:opacity .25s,transform .25s;max-width:340px;`;
    t.textContent = msg;
    host.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; setTimeout(() => t.remove(), 300); }, 3600);
  }

  return { greeting, statsFor, toast };
})();

/* ─────────────────────────────────────────────────────────────────────────
   SHARED TOP NAVIGATION  (built once - never drifts between pages)
   ───────────────────────────────────────────────────────────────────────── */
(function buildNav() {
  if (typeof AUTH === 'undefined') return;          // auth not loaded (e.g. login page)
  const nav = document.querySelector('.topnav');
  if (!nav) return;                                  // page has no nav (login)
  const session = AUTH.getUser();
  if (!session) return;                              // not signed in; page will redirect

  const me = OFFICERS.forSession(session);
  const canReview  = AUTH.canReview && AUTH.canReview();
  const canSeeAll  = AUTH.canSeeAll && AUTH.canSeeAll();
  const canConsole = AUTH.canAccessConsole && AUTH.canAccessConsole();
  const here = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();

  // link: [href, label, visible, id?, extraClass?]
  const links = [
    ['dashboard.html', 'Dashboard',         true],
    ['newsletter.html','Newsletter',        true],
    ['dcm.html',       'DCMs',              true],
    ['mrf.html',       'Monthly RF',        true],
    ['committee.html', 'Committee Reports', true],
    ['calendar.html',  'Calendar',          true],
    ['review.html',    'Review Queue',      canReview || canSeeAll, 'navReview'],
    ['console.html',   'Console',           canConsole, 'navConsole', 'topnav-console'],
  ];

  const linkHTML = links.filter(l => l[2]).map(([href, label, , id, extra]) => {
    const active = (here === href) || (here === 'submit.html' && href === 'newsletter.html')
                                    || (here === 'archive.html' && href === 'newsletter.html');
    return `<a href="${href}" class="topnav-link ${extra || ''} ${active ? 'active' : ''}"${id ? ` id="${id}"` : ''}>${label}</a>`;
  }).join('');

  const roleLabel = (session.role || '').toUpperCase();

  nav.innerHTML = `
    <a href="dashboard.html" class="topnav-logo">
      <img src="Key%20Club%20Logo.png" alt="Key Club" class="topnav-mark">
      <div><div class="topnav-name">MO-ARK District</div><div class="topnav-sub">Officer Portal</div></div>
    </a>
    <div class="topnav-divider"></div>
    <button class="nav-burger" id="navBurger" aria-label="Menu">☰</button>
    <div class="topnav-links" id="navLinks">${linkHTML}</div>
    <div class="topnav-user">
      <button class="nav-menu-btn" id="navMenuBtn">
        <span class="topnav-username" id="navName">${me.name}</span>
        <span class="role-chip role-${session.role}" id="navRole">${roleLabel}</span>
        <span class="topnav-avatar" id="navAvatar">${OFFICERS.avatarInner(me)}</span>
      </button>
      <div class="nav-menu" id="navMenu">
        <div class="nav-menu-head">
          <span class="topnav-avatar" style="width:42px;height:42px;">${OFFICERS.avatarInner(me)}</span>
          <div><div class="nav-menu-name">${me.name}</div><div class="nav-menu-sub">${me.title}</div></div>
        </div>
        <a class="nav-menu-item" href="profile.html">👤 &nbsp;My Profile</a>
        <a class="nav-menu-item" href="dashboard.html">🏠 &nbsp;Dashboard</a>
        <button class="nav-menu-item danger" id="navSignOut">⏻ &nbsp;Sign out</button>
      </div>
    </div>`;

  // Dropdown
  const menu = nav.querySelector('#navMenu');
  const menuBtn = nav.querySelector('#navMenuBtn');
  menuBtn.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('open'); });
  document.addEventListener('click', e => { if (!menu.contains(e.target) && !menuBtn.contains(e.target)) menu.classList.remove('open'); });
  nav.querySelector('#navSignOut').addEventListener('click', () => AUTH.logout());

  // Mobile burger
  const burger = nav.querySelector('#navBurger');
  const linksEl = nav.querySelector('#navLinks');
  burger.addEventListener('click', () => linksEl.classList.toggle('open'));
})();
