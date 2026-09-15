/**
 * MO-ARK District Portal - Cloudflare Worker
 *
 * ROOT-CAUSE FIX (2026): corrupted / empty PDF downloads.
 *   GitHub's Contents API only returns the base64 `content` field for files
 *   1 MB or smaller. Any newsletter over ~1 MB (most of them) came back with
 *   an EMPTY content field, so servePDF produced an empty/corrupt file.
 *   The fix: fetch the file with the "application/vnd.github.raw" media type,
 *   which streams the real bytes for files up to 100 MB. servePDF now returns
 *   those bytes directly - no base64 round-trip. This fixes newsletter, DCM,
 *   and committee PDF downloads (all route through servePDF).
 *
 * Deploy: `wrangler deploy` (needs the GITHUB_TOKEN secret already set), or
 * paste this into the Worker's editor in the Cloudflare dashboard and Save.
 */

const GITHUB_USER    = 'MO-ARKKeyClubWebmaster';
const GITHUB_REPO    = 'moarkkeyclub-net';
const GITHUB_BRANCH  = 'main';
const DATA_PATH      = 'submissions';
const AUDIT_LOG_PATH = 'logs/audit.json';
const DCM_PATH       = 'data/dcms.json';
const MRF_PATH       = 'data/mrfs.json';
const COMMITTEE_PATH = 'data/committee-reports.json';
const DCM_PDF_PATH   = 'dcm-reports';
const COMMITTEE_PDF_PATH = 'committee-pdfs';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS });

    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;
    const ip     = request.headers.get('CF-Connecting-IP') ||
                   request.headers.get('X-Forwarded-For') ||
                   'unknown';

    try {
      // PDF PROXY (newsletters)
      if (path.startsWith('/pdf/') && method === 'GET') {
        const id = path.split('/')[2];
        return await servePDF(`${DATA_PATH}/${id}.pdf`, env);
      }

      // DCM PDF PROXY
      if (path.startsWith('/dcm-pdf/') && method === 'GET') {
        const id = path.split('/')[2];
        return await servePDF(`${DCM_PDF_PATH}/${id}.pdf`, env);
      }

      // COMMITTEE PDF PROXY
      if (path.startsWith('/committee-pdf/') && method === 'GET') {
        const id = path.split('/')[2];
        return await servePDF(`${COMMITTEE_PDF_PATH}/${id}.pdf`, env);
      }

      // AUDIT LOGS
      if (path === '/log' && method === 'POST') {
        const body = await request.json();
        await writeLog({ ...body, ip }, env);
        return json({ ok: true });
      }

      if (path === '/logs' && method === 'GET') {
        return await getLogs(env);
      }

      // NEWSLETTER SUBMISSIONS
      if (path === '/submissions' && method === 'GET')
        return await listSubmissions(env);

      if (path === '/submissions' && method === 'POST') {
        const body   = await request.json();
        const result = await createSubmission(body, env);
        await writeLog({
          actor:     body.ltgEmail,
          actorName: body.ltgName,
          actorRole: 'ltg',
          actorDiv:  body.division,
          action:    'SUBMISSION_UPLOADED',
          detail:    `${body.month} ${body.year} - ${body.type === 'newsletter' ? 'Division Newsletter' : 'DC Report'} - ${body.fileName}`,
          ip,
        }, env);
        return result;
      }

      if (path.startsWith('/submissions/') && method === 'GET') {
        const id = path.split('/')[2];
        return await getSubmission(id, env);
      }

      if (path.startsWith('/submissions/') && method === 'PATCH') {
        const id     = path.split('/')[2];
        const body   = await request.json();

        if (body.deleted === true) {
          const result = await deleteSubmission(id, env);
          await writeLog({
            actor:     body._logActor     || 'unknown',
            actorName: body._logActorName || 'Unknown',
            actorRole: body._logActorRole || 'webmaster',
            actorDiv:  body._logActorDiv  || null,
            action:    'SUBMISSION_DELETED',
            detail:    `Permanently deleted submission ${id}`,
            ip,
          }, env);
          return result;
        }

        const result = await updateSubmission(id, body, env);
        if (body.status && body._logActor) {
          const actionMap = {
            'pending-webmaster': 'EDITOR_APPROVED',
            'approved':          'WEBMASTER_APPROVED',
            'denied':            'SUBMISSION_RETURNED',
          };
          const action = actionMap[body.status] || 'STATUS_UPDATED';
          await writeLog({
            actor:     body._logActor,
            actorName: body._logActorName,
            actorRole: body._logActorRole,
            actorDiv:  body._logActorDiv || null,
            action,
            detail:    body._logDetail || `Status set to ${body.status}`,
            ip,
          }, env);
        }
        return result;
      }

      // DCM ROUTES
      if (path === '/dcm' && method === 'GET') {
        const { content } = await ghReadJSON(DCM_PATH, env);
        return json(content || []);
      }

      if (path === '/dcm' && method === 'POST') {
        const body    = await request.json();
        const { content, sha } = await ghReadJSON(DCM_PATH, env);
        const records = content || [];
        const id      = `dcm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const now     = new Date().toISOString();
        const newRec  = {
          id,
          createdAt:    now,
          updatedAt:    now,
          reportStatus: 'pending',
          ...body,
        };
        records.push(newRec);
        await ghWriteJSON(DCM_PATH, records, sha,
          `DCM scheduled: Div ${body.division} DCM ${body.dcmNumber}`, env);
        await writeLog({
          actor:     body.ltgEmail,
          actorName: body.ltgName,
          actorRole: 'ltg',
          actorDiv:  body.division,
          action:    'DCM_SCHEDULED',
          detail:    `DCM ${body.dcmNumber} scheduled for ${body.date} (${body.format})`,
          ip,
        }, env);
        return json(newRec, 201);
      }

      if (path.startsWith('/dcm/') && method === 'GET') {
        const id = path.split('/')[2];
        const { content } = await ghReadJSON(DCM_PATH, env);
        const rec = (content || []).find(d => d.id === id);
        if (!rec) return json({ error: 'Not found' }, 404);
        return json(rec);
      }

      if (path.startsWith('/dcm/') && method === 'PATCH') {
        const id    = path.split('/')[2];
        const body  = await request.json();
        const { content, sha } = await ghReadJSON(DCM_PATH, env);
        const records = content || [];
        const idx   = records.findIndex(d => d.id === id);
        if (idx === -1) return json({ error: 'Not found' }, 404);
        const now   = new Date().toISOString();

        if (body.pdfData) {
          await ghWritePDF(`${DCM_PDF_PATH}/${id}.pdf`, body.pdfData, null,
            `DCM report PDF: ${id}`, env);
          delete body.pdfData;
          body.pdfUrl = `/dcm-pdf/${id}`;
          body.reportSubmittedAt = now;
          body.reportStatus      = 'submitted';
        }

        records[idx] = { ...records[idx], ...body, updatedAt: now };
        await ghWriteJSON(DCM_PATH, records, sha, `DCM updated: ${id}`, env);

        if (body.reportStatus === 'submitted' && body._logActor) {
          await writeLog({
            actor:     body._logActor,
            actorName: body._logActorName,
            actorRole: body._logActorRole || 'ltg',
            actorDiv:  body._logActorDiv  || null,
            action:    'DCM_REPORT_SUBMITTED',
            detail:    body._logDetail || `DCM report filed for ${id}`,
            ip,
          }, env);
        }

        return json(records[idx]);
      }

      // MRF ROUTES
      if (path === '/mrf' && method === 'GET') {
        const { content } = await ghReadJSON(MRF_PATH, env);
        return json(content || []);
      }

      if (path === '/mrf' && method === 'POST') {
        const body    = await request.json();
        const { content, sha } = await ghReadJSON(MRF_PATH, env);
        const records = content || [];
        const id      = `mrf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const now     = new Date().toISOString();
        const newRec  = {
          id,
          submittedAt: now,
          updatedAt:   now,
          ...body,
        };
        records.push(newRec);
        await ghWriteJSON(MRF_PATH, records, sha,
          `MRF: Div ${body.division} ${body.month} ${body.calYear || ''}`, env);
        await writeLog({
          actor:     body.ltgEmail,
          actorName: body.ltgName,
          actorRole: 'ltg',
          actorDiv:  body.division,
          action:    'MRF_SUBMITTED',
          detail:    `Monthly Report Form - ${body.month} ${body.calYear || ''}`,
          ip,
        }, env);
        return json(newRec, 201);
      }

      if (path.startsWith('/mrf/') && method === 'GET') {
        const id = path.split('/')[2];
        const { content } = await ghReadJSON(MRF_PATH, env);
        const rec = (content || []).find(m => m.id === id);
        if (!rec) return json({ error: 'Not found' }, 404);
        return json(rec);
      }

      // COMMITTEE ROUTES
      if (path === '/committee' && method === 'GET') {
        const { content } = await ghReadJSON(COMMITTEE_PATH, env);
        return json(content || []);
      }

      if (path === '/committee' && method === 'POST') {
        const body    = await request.json();
        const { content, sha } = await ghReadJSON(COMMITTEE_PATH, env);
        const records = content || [];
        const id      = `com-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const now     = new Date().toISOString();

        if (body.pdfData) {
          await ghWritePDF(`${COMMITTEE_PDF_PATH}/${id}.pdf`, body.pdfData, null,
            `Committee report PDF: ${id}`, env);
          delete body.pdfData;
          body.pdfUrl = `/committee-pdf/${id}`;
        }

        const newRec = {
          id,
          submittedAt: now,
          updatedAt:   now,
          ...body,
        };
        records.push(newRec);
        await ghWriteJSON(COMMITTEE_PATH, records, sha,
          `Committee report: ${body.submitterName} ${body.month} ${body.year}`, env);
        await writeLog({
          actor:     body.submitterEmail,
          actorName: body.submitterName,
          actorRole: body.submitterRole || 'ltg',
          actorDiv:  body.division      || null,
          action:    'COMMITTEE_SUBMITTED',
          detail:    `Committee report - ${body.committeeName} - ${body.month} ${body.year}`,
          ip,
        }, env);
        return json(newRec, 201);
      }

      if (path.startsWith('/committee/') && method === 'GET') {
        const id = path.split('/')[2];
        const { content } = await ghReadJSON(COMMITTEE_PATH, env);
        const rec = (content || []).find(c => c.id === id);
        if (!rec) return json({ error: 'Not found' }, 404);
        return json(rec);
      }

      return json({ error: 'Not found' }, 404);

    } catch (err) {
      console.error(err);
      return json({ error: err.message }, 500);
    }
  }
};

// AUDIT LOG
async function writeLog(entry, env) {
  const now = new Date();
  const log = {
    id:        `log-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp:  now.toISOString(),
    actor:      entry.actor     || 'unknown',
    actorName:  entry.actorName || 'Unknown',
    actorRole:  entry.actorRole || 'unknown',
    actorDiv:   entry.actorDiv  || null,
    action:     entry.action    || 'UNKNOWN',
    detail:     entry.detail    || '',
    ip:         entry.ip        || 'unknown',
  };

  try {
    const existing = await ghFetch(AUDIT_LOG_PATH, 'GET', null, env);
    let entries = [];
    let sha     = null;
    if (existing) {
      sha = existing.sha;
      try { entries = JSON.parse(decodeURIComponent(atob(existing.content.replace(/\n/g, '')))); }
      catch { entries = []; }
    }
    entries.push(log);
    if (entries.length > 2000) entries = entries.slice(-2000);
    const encoded = btoa(encodeURIComponent(JSON.stringify(entries)));
    const body    = { message: `Log: ${log.action} by ${log.actorName}`, content: encoded, branch: GITHUB_BRANCH };
    if (sha) body.sha = sha;
    await ghFetch(AUDIT_LOG_PATH, 'PUT', body, env);
  } catch (e) {
    console.error('Log write failed:', e.message);
  }
  return log;
}

async function getLogs(env) {
  try {
    const existing = await ghFetch(AUDIT_LOG_PATH, 'GET', null, env);
    if (!existing) return json([]);
    const entries = JSON.parse(decodeURIComponent(atob(existing.content.replace(/\n/g, ''))));
    return json([...entries].reverse());
  } catch (e) {
    console.error('getLogs failed:', e.message);
    return json([]);
  }
}

// GITHUB HELPERS
async function ghFetch(path, method, body, env) {
  const url  = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${path}`;
  const opts = {
    method,
    headers: {
      'Authorization':        `Bearer ${env.GITHUB_TOKEN}`,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent':           'moark-portal-worker',
      'Content-Type':         'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  if (res.status === 404) return null;
  return res.json();
}

async function ghReadJSON(filePath, env) {
  const data = await ghFetch(filePath, 'GET', null, env);
  if (!data) return { content: null, sha: null };
  try {
    // Small files (<1MB) include base64 content. Larger files come back with an
    // empty content field, so fall back to the raw download URL. Using
    // decodeURIComponent(escape(...)) makes UTF-8 (accents, curly quotes) decode
    // correctly instead of turning into mojibake.
    if (data.content && data.content.trim().length) {
      const decoded = decodeURIComponent(escape(atob(data.content.replace(/\s+/g, ''))));
      return { content: JSON.parse(decoded), sha: data.sha };
    }
    if (data.download_url) {
      const raw = await fetch(data.download_url);
      if (raw.ok) return { content: JSON.parse(await raw.text()), sha: data.sha };
    }
    return { content: null, sha: data.sha };
  } catch {
    return { content: null, sha: data.sha };
  }
}

async function ghWriteJSON(filePath, content, sha, message, env) {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
  const body    = { message, content: encoded, branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  return ghFetch(filePath, 'PUT', body, env);
}

// Write a PDF: extract + clean the base64 from the data URL and hand it to GitHub.
async function ghWritePDF(filePath, dataURL, sha, message, env) {
  const base64 = dataURL.includes(',') ? dataURL.split(',')[1] : dataURL;
  const clean  = base64.replace(/\s+/g, '');
  if (!clean || clean.length === 0) throw new Error('PDF base64 is empty');
  const body = { message, content: clean, branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  return ghFetch(filePath, 'PUT', body, env);
}

async function ghDelete(filePath, sha, message, env) {
  const body = { message, sha, branch: GITHUB_BRANCH };
  return ghFetch(filePath, 'DELETE', body, env);
}

async function ghList(env) {
  const data = await ghFetch(DATA_PATH, 'GET', null, env);
  if (!data || !Array.isArray(data)) return [];
  return data.filter(f => f.name.endsWith('.json'));
}

/**
 * FIXED PDF SERVING.
 * Fetches the file with the GitHub "raw" media type, which returns the real
 * bytes for files up to 100 MB - unlike the default JSON media type, whose
 * base64 `content` field is EMPTY for anything over 1 MB (the old bug).
 */
async function servePDF(filePath, env) {
  try {
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`;
    const res = await fetch(url, {
      headers: {
        'Authorization':        `Bearer ${env.GITHUB_TOKEN}`,
        'Accept':               'application/vnd.github.raw',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent':           'moark-portal-worker',
      },
    });

    if (res.status === 404) {
      return new Response('PDF not found', { status: 404, headers: CORS });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return new Response(`Error fetching PDF: ${res.status} ${text}`, { status: 500, headers: CORS });
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) {
      return new Response('PDF content is empty', { status: 500, headers: CORS });
    }
    // Verify PDF magic bytes (%PDF)
    if (bytes.length < 4 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
      return new Response('Stored file is not a valid PDF', { status: 500, headers: CORS });
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filePath.split('/').pop()}"`,
        'Cache-Control': 'private, max-age=3600',
        'Content-Length': bytes.length.toString(),
      },
    });
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500, headers: CORS });
  }
}

// SUBMISSION OPERATIONS
async function listSubmissions(env) {
  const files = await ghList(env);
  const submissions = await Promise.all(
    files.map(async f => {
      const { content } = await ghReadJSON(f.path, env);
      return content;
    })
  );
  return json(
    submissions
      .filter(Boolean)
      .filter(s => !s.deleted)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
  );
}

async function getSubmission(id, env) {
  const { content } = await ghReadJSON(`${DATA_PATH}/${id}.json`, env);
  if (!content) return json({ error: 'Not found' }, 404);
  if (content.deleted) return json({ error: 'Submission has been deleted' }, 410);
  return json(content);
}

async function createSubmission(body, env) {
  const id  = `moark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  if (!body.fileData || !body.fileData.startsWith('data:')) {
    throw new Error('Invalid or missing PDF data');
  }

  await ghWritePDF(
    `${DATA_PATH}/${id}.pdf`,
    body.fileData,
    null,
    `PDF: Div ${body.division} ${body.month} ${body.year}`,
    env
  );

  const submission = {
    id,
    division:    body.division,
    ltgEmail:    body.ltgEmail,
    ltgName:     body.ltgName,
    year:        body.year,
    month:       body.month,
    type:        body.type,
    fileName:    body.fileName,
    fileSize:    body.fileSize,
    pdfUrl:      `/pdf/${id}`,
    status:      'pending-editor',
    submittedAt: now,
    updatedAt:   now,
    deleted:     false,
    thread: body.initialNote ? [{
      from:      'ltg',
      fromName:  body.ltgName,
      to:        'editor',
      message:   body.initialNote,
      timestamp: now,
    }] : [],
  };

  await ghWriteJSON(
    `${DATA_PATH}/${id}.json`,
    submission,
    null,
    `Submit: Div ${body.division} ${body.month} ${body.year}`,
    env
  );

  return json(submission, 201);
}

async function updateSubmission(id, body, env) {
  const { content, sha } = await ghReadJSON(`${DATA_PATH}/${id}.json`, env);
  if (!content) return json({ error: 'Not found' }, 404);
  if (content.deleted) return json({ error: 'Submission has been deleted' }, 410);

  const now = new Date().toISOString();
  if (body.status)        content.status = body.status;
  if (body.threadMessage) content.thread.push({ ...body.threadMessage, timestamp: now });
  content.updatedAt = now;

  await ghWriteJSON(
    `${DATA_PATH}/${id}.json`,
    content,
    sha,
    `Update: ${id} → ${content.status}`,
    env
  );
  return json(content);
}

async function deleteSubmission(id, env) {
  const { content, sha } = await ghReadJSON(`${DATA_PATH}/${id}.json`, env);
  if (!content) return json({ error: 'Not found' }, 404);

  content.deleted = true;
  content.deletedAt = new Date().toISOString();

  await ghWriteJSON(
    `${DATA_PATH}/${id}.json`,
    content,
    sha,
    `Delete: ${id}`,
    env
  );

  try {
    const pdfData = await ghFetch(`${DATA_PATH}/${id}.pdf`, 'GET', null, env);
    if (pdfData && pdfData.sha) {
      await ghDelete(`${DATA_PATH}/${id}.pdf`, pdfData.sha, `Delete PDF: ${id}`, env);
    }
  } catch (e) {
    console.error(`PDF deletion failed for ${id}:`, e.message);
  }

  return json({ ok: true, message: 'Submission deleted successfully' });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
