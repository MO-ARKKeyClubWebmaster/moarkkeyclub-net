/**
 * MO-ARK District Portal — Audit Logger
 * Drop this script into every portal page AFTER auth.js and api.js.
 * Call LOG.record(action, detail) anywhere to fire an audit entry.
 * The Worker captures the real IP server-side via CF-Connecting-IP.
 *
 * Usage:
 *   LOG.record('LOGIN', 'Signed in to portal');
 *   LOG.record('CONSOLE_ACCESS', 'Opened admin console');
 */

const LOG = (() => {
  const BASE = 'https://moark-portal-api.moarkkeyclubwebmaster.workers.dev';

  /**
   * Record an audit event. Fire-and-forget — never throws.
   * @param {string} action  - Uppercase action key, e.g. 'LOGIN'
   * @param {string} detail  - Human-readable description
   */
  async function record(action, detail = '') {
    try {
      const user = AUTH.getUser();
      if (!user) return; // Not logged in, nothing to attribute

      await fetch(`${BASE}/log`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor:     user.email,
          actorName: user.name,
          actorRole: user.role,
          actorDiv:  user.division || null,
          action,
          detail,
          // IP is injected server-side via CF-Connecting-IP header
        }),
      });
    } catch (e) {
      // Silent — logging must never break the UI
    }
  }

  /**
   * Build a rich detail string for a submission action.
   * @param {object} sub  - Submission object
   * @returns {string}
   */
  function subDetail(sub) {
    return `Div ${sub.division} · ${sub.month} ${sub.year} · ${sub.type === 'newsletter' ? 'Newsletter' : 'DC Report'}`;
  }

  return { record, subDetail };
})();