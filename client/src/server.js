
const express = require('express');
const { randomBytes } = require('crypto');

const app = express();
app.use(express.json({ limit: '32kb' }));

const API = process.env.API_URL || 'http://localhost:3000';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const DEMO_MODE = process.env.DEMO_MODE === 'true';

const sessions = new Map();
const SESSION_MS = 60 * 60 * 1000;

function getSession(req) {
  const cookie = (req.headers.cookie || '')
    .split(';')
    .map(x => x.trim())
    .find(x => x.startsWith('quota_session='));

  if (!cookie) return null;

  const token = cookie.slice('quota_session='.length);
  const session = sessions.get(token);

  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return session;
}

function setSession(req, res, data) {
  const old = (req.headers.cookie || '')
    .split(';')
    .map(x => x.trim())
    .find(x => x.startsWith('quota_session='));

  if (old) {
    sessions.delete(old.split('=')[1]);
  }

  const token = randomBytes(32).toString('hex');

  sessions.set(token, {
    ...data,
    expiresAt: Date.now() + SESSION_MS
  });

  res.cookie('quota_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MS,
    path: '/'
  });
}

function requireLogin(req, res, next) {
  if (getSession(req)) return next();

  res.type('html').send(
    head('Select a Company', req.path === '/demo' ? 'demo' : 'dashboard') + `
    <section style="text-align:center;padding:45px 25px">
      <h1>Please select a company first</h1>
      <p class="muted">
        Select a company to access its dashboard,
        manage quotas, or simulate user requests.
      </p>
      <a href="${DEMO_MODE ? '/companies' : '/login'}"
         class="primary-link">Select Company &rarr;</a>
    </section>
    </body></html>`
  );
}

function demoOnly(req, res, next) {
  if (!DEMO_MODE || !ADMIN_SECRET) {
    return res.status(404).json({
      error: 'Demo mode is disabled'
    });
  }
  next();
}

async function apiRequest(url, options = {}) {
  const response = await fetch(API + url, options);
  const raw = await response.text();

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { error: raw };
  }

  return {
    status: response.status,
    ok: response.ok,
    data
  };
}

async function forward(req, res, path) {
  const session = getSession(req);

  if (!session) {
    return res.status(401).json({
      error: 'Select or log in to a company first'
    });
  }

  try {
    const headers = {
      'content-type': 'application/json'
    };

    if (session.apiKey) {
      headers['x-api-key'] = session.apiKey;
    } else if (session.demoToken) {
      headers['x-demo-token'] = session.demoToken;
    }

    const result = await apiRequest(path, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method)
        ? undefined
        : JSON.stringify(req.body || {})
    });

    res.status(result.status).json(result.data);
  } catch {
    res.status(502).json({
      error: 'Backend unavailable'
    });
  }
}

// ===============================
// API PROXY
// ===============================

app.post('/demo-api/consume', (req, res) =>
  forward(req, res, '/api/consume')
);

app.get('/demo-api/users', (req, res) =>
  forward(req, res, '/api/users')
);

const managementPaths = new Set([
  '/api/plans',
  '/api/account',
  '/api/account/plan',
  '/api/users',
  '/api/usage',
  '/api/history'
]);

app.use('/manage', (req, res) => {
  const path = req.originalUrl.slice('/manage'.length);
  const pathname = path.split('?')[0];

  const dynamicPlan =
    /^\/api\/plans\/[0-9a-f-]{36}$/i.test(pathname);

  const dynamicUser =
    /^\/api\/users\/[0-9a-f-]{36}\/plan$/i.test(pathname);

  if (
    !managementPaths.has(pathname) &&
    !dynamicPlan &&
    !dynamicUser
  ) {
    return res.status(404).json({
      error: 'Unknown route'
    });
  }

  forward(req, res, path);
});

// ===============================
// COMPANY MANAGEMENT API
// ===============================

app.get('/demo-companies', demoOnly, async (_req, res) => {
  try {
    const result = await apiRequest('/admin/demo/accounts', {
      headers: { 'x-admin-secret': ADMIN_SECRET }
    });

    res.status(result.status).json(result.data);
  } catch {
    res.status(502).json({
      error: 'Cannot load companies'
    });
  }
});

app.post('/demo-companies/:id/select', demoOnly, async (req, res) => {
  const id = req.params.id;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({
      error: 'Invalid company id'
    });
  }

  try {
    const result = await apiRequest(
      '/admin/demo/accounts/' + encodeURIComponent(id) + '/token',
      {
        method: 'POST',
        headers: { 'x-admin-secret': ADMIN_SECRET }
      }
    );

    if (!result.ok) {
      return res.status(result.status).json(result.data);
    }

    setSession(req, res, {
      demoToken: result.data.demoToken,
      accountId: id
    });

    res.json({ success: true });
  } catch {
    res.status(502).json({
      error: 'Unable to select company'
    });
  }
});

app.post('/demo-companies', demoOnly, async (req, res) => {
  const name = req.body?.name;

  if (
    typeof name !== 'string' ||
    name.trim().length < 2 ||
    name.trim().length > 100
  ) {
    return res.status(400).json({
      error: 'Company name must be 2â€“100 characters'
    });
  }

  try {
    const result = await apiRequest('/admin/accounts', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({ name: name.trim() })
    });

    if (!result.ok) {
      return res.status(result.status).json(result.data);
    }

    const company = result.data;

    setSession(req, res, {
      apiKey: company.apiKey,
      accountId: company.id
    });

    res.status(201).json({
      success: true,
      id: company.id,
      name: company.name,
      apiKey: company.apiKey
    });
  } catch {
    res.status(502).json({
      error: 'Unable to create company'
    });
  }
});

// ===============================
// STYLES
// ===============================



function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}
app.get('/styles.css', (_req, res) => {
  res.sendFile('styles.css', { root: __dirname });
});
const head = (title, active) => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
<nav>
  <a class="${active === 'home' ? 'active' : ''}" href="/">Home</a>
  ${DEMO_MODE
    ? `<a class="${active === 'companies' ? 'active' : ''}"
         href="/companies">Companies</a>`
    : ''}
  <a class="${active === 'dashboard' ? 'active' : ''}"
     href="/dashboard">Dashboard</a>
  <a class="${active === 'demo' ? 'active' : ''}"
     href="/demo">User Demo</a>
</nav>
`;

// ===============================
// HOME
// ===============================

app.get('/', (_req, res) => {
  res.type('html').send(
    head('Usage Metering Service', 'home') + `
    <h1>Usage Metering & Quota Service</h1>
    <p class="muted">
      Multi-tenant quota management and usage tracking.
    </p>

    <div class="grid">
      ${DEMO_MODE ? `
      <section>
        <h2>Companies</h2>
        <p>View and create companies.</p>
        <a href="/companies">Manage Companies →</a>
      </section>` : ''}

      <section>
        <h2>Dashboard</h2>
        <p>Manage plans, users and quotas.</p>
        <a href="/dashboard">Open Dashboard →</a>
      </section>

      <section>
        <h2>User Demo</h2>
        <p>Simulate usage requests.</p>
        <a href="/demo">Open Demo →</a>
      </section>
    </div>

    <p class="notice">
      Local evaluation environment only.
      Demo company switching is not intended for public deployment.
    </p>
    </body></html>`
  );
});

// ===============================
// COMPANIES PAGE
// ===============================

app.get('/companies', demoOnly, (_req, res) => {
  res.type('html').send(
    head('Companies', 'companies') + `
    <h1>Companies</h1>
    <p class="muted">
      All companies stored in PostgreSQL.
      Select a company or create a new one.
    </p>

    <p class="muted">
      Already have a company API key?
      <a href="/login">Login with API Key →</a>
    </p>

    <section>
      <h2>Available Companies</h2>
      <button class="secondary" onclick="loadCompanies()">
        Refresh Companies
      </button>
      <div id="companies" style="margin-top:16px">Loading...</div>
    </section>

    <section>
      <h2>Create New Company</h2>
      <label>Company Name</label>
      <input id="companyName" placeholder="Creative Studio" maxlength="100">
      <button onclick="createCompany()">Create Company</button>
    </section>

    <section id="keyBox" style="display:none">
      <h2>New Company API Key</h2>
      <p class="notice">
        Save this API key now.
        It will not be shown again after leaving this page.
      </p>
      <pre id="companyKey"></pre>
      <div class="actions">
        <button onclick="copyKey()">Copy API Key</button>
        <a href="/dashboard">Open Dashboard →</a>
      </div>
    </section>

    <section>
      <h2>Messages</h2>
      <pre id="message">Ready.</pre>
    </section>

    <script>
      const $ = id => document.getElementById(id);

      async function request(url, method = 'GET', body) {
        const r = await fetch(url, {
          method,
          headers: { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body)
        });

        const data = await r.json();

        if (!r.ok) {
          throw Error(data.error || 'Request failed');
        }

        return data;
      }

      async function loadCompanies() {
        try {
          const companies = await request('/demo-companies');
          const container = $('companies');
          container.replaceChildren();

          if (!companies.length) {
            container.textContent = 'No companies found.';
            return;
          }

          for (const company of companies) {
            const card = document.createElement('div');
            card.className = 'stat company';

            const info = document.createElement('div');
            const title = document.createElement('strong');
            title.textContent = company.name;

            const details = document.createElement('small');
            details.textContent =
              'Plan: ' + company.plan_name +
              ' | Users: ' + company.user_count;

            info.append(title, document.createElement('br'), details);

            const button = document.createElement('button');
            button.textContent = 'Open Dashboard →';
            button.onclick = () => selectCompany(company.id);

            card.append(info, button);
            container.append(card);
          }

          $('message').textContent =
            companies.length + ' companies loaded.';
        } catch (e) {
          $('message').textContent = 'Error: ' + e.message;
        }
      }

      async function selectCompany(id) {
        try {
          $('message').textContent = 'Opening company...';

          await request(
            '/demo-companies/' + encodeURIComponent(id) + '/select',
            'POST'
          );

          window.location.href = '/dashboard';
        } catch (e) {
          $('message').textContent = 'Error: ' + e.message;
        }
      }

      async function createCompany() {
        try {
          const name = $('companyName').value.trim();

          const result = await request(
            '/demo-companies',
            'POST',
            { name }
          );

          if (!result.apiKey) {
            throw Error('Company created, but API key was not returned.');
          }

          $('companyKey').textContent = result.apiKey;
          $('keyBox').style.display = 'block';
          $('companyName').value = '';

          await loadCompanies();

          $('message').textContent =
            'Company created. Copy its API key.';

          $('keyBox').scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        } catch (e) {
          $('message').textContent = 'Error: ' + e.message;
        }
      }

      async function copyKey() {
        try {
          await navigator.clipboard.writeText(
            $('companyKey').textContent
          );
          $('message').textContent = 'API key copied.';
        } catch {
          $('message').textContent =
            'Please copy the API key manually.';
        }
      }

      loadCompanies();
    </script>
    </body></html>`
  );
});

// ===============================
// API KEY LOGIN
// ===============================



app.get('/login', (_req, res) => {
  res.type('html').send(
    head('Company Login', '') + `
    <div style="max-width:480px; margin:24px auto 0;">
  <h1 style="text-align:center; margin-bottom:16px;">Company Login</h1>
</div>

<section style="max-width:480px; margin:0 auto;">
      <p>Enter your company's API key.</p>

      <form id="loginForm">
        <label>Company API Key</label>
        <input id="apiKey" type="password"
               autocomplete="off" required>
        <button type="submit">Login</button>
      </form>

      <pre id="message"></pre>
    </section>

    <script>
      document.getElementById('loginForm')
        .addEventListener('submit', async e => {
          e.preventDefault();

          const message = document.getElementById('message');

          try {
            const r = await fetch('/login', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                apiKey: document.getElementById('apiKey').value
              })
            });

            const data = await r.json();

            if (!r.ok) {
              throw Error(data.error || 'Login failed');
            }

            window.location.href = '/dashboard';
          } catch (error) {
            message.textContent = error.message;
          }
        });
    </script>
    </body></html>`
  );
});



app.post('/login', async (req, res) => {
  const apiKey = req.body?.apiKey;

  if (
    typeof apiKey !== 'string' ||
    !/^quota_[0-9a-f]{48}$/.test(apiKey)
  ) {
    return res.status(401).json({
      error: 'Invalid API key'
    });
  }

  try {
    const result = await apiRequest('/api/account', {
      headers: { 'x-api-key': apiKey }
    });

    if (!result.ok) {
      return res.status(401).json({
        error: 'Invalid API key'
      });
    }

    setSession(req, res, {
      apiKey,
      accountId: result.data.id
    });

    res.json({
      success: true,
      company: result.data.name
    });
  } catch {
    res.status(502).json({
      error: 'Backend unavailable'
    });
  }
});

app.post('/logout', (req, res) => {
  const entry = (req.headers.cookie || '')
    .split(';')
    .map(x => x.trim())
    .find(x => x.startsWith('quota_session='));

  if (entry) {
    sessions.delete(entry.split('=')[1]);
  }

  res.clearCookie('quota_session', { path: '/' });
  res.json({ success: true });
});

// ===============================
// DASHBOARD
// ===============================

app.get('/dashboard', requireLogin, (_req, res) => {
  res.type('html').send(
    head('Company Dashboard', 'dashboard') + `
    <h1>Company Dashboard</h1>

    <p class="muted">
      Currently managing:
      <strong id="currentCompany">Loading...</strong>
    </p>

    <p class="muted">Manage company plans, users and quotas.</p>

    <p class="notice">
      Local evaluation environment.
      Demo access is not human authentication.
    </p>

    <div class="actions">
      ${DEMO_MODE
        ? '<a href="/companies">Switch Company →</a>'
        : ''}
      <button class="secondary" onclick="logout()">Logout</button>
    </div>

    <section>
      <h2>Company Overview</h2>
      <div id="overview" class="grid">Loading...</div>
      <button class="secondary" onclick="refresh()">
        Refresh All
      </button>
    </section>

    <div class="grid">
      <section>
        <h2>Create Custom Plan</h2>

        <label>Plan name</label>
        <input id="newName" placeholder="Business Custom">

        <label>Scope</label>
        <select id="newScope">
          <option value="account">Account — Entire Company</option>
          <option value="user">User — Individual User Plan</option>
        </select>

        <label>Monthly limit</label>
        <input id="newMonthly" type="number"
               min="0" step="1" value="500">

        <label>Max per request</label>
        <input id="newMax" type="number"
               min="1" step="1" value="50">

        <button onclick="createPlan()">Create Plan</button>
      </section>

      <section>
        <h2>Assign Company Plan</h2>

        <label>Account plan</label>
        <select id="accountPlan"></select>

        <button onclick="assignAccount()">
          Apply to Company
        </button>

        <p class="muted">
          Changing plans does not reset already-used units.
        </p>
      </section>
    </div>

    <section>
      <h2>Available Plans</h2>

      <div style="overflow:auto">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Scope</th>
              <th>Monthly</th>
              <th>Per Request</th>
              <th>Type</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="plansBody"></tbody>
        </table>
      </div>
    </section>

    <!-- NEW EDIT CUSTOM PLAN MODAL -->

    <div id="editOverlay" class="edit-overlay">
      <div class="edit-dialog"
           role="dialog"
           aria-modal="true"
           aria-labelledby="editTitle">

        <h2 id="editTitle">Edit Custom Plan</h2>
        <p class="muted" id="editPlanName"></p>

        <label for="editMonthly">Monthly Limit</label>
        <input id="editMonthly" type="number"
               min="0" step="1">

        <label for="editMax">Max Per Request</label>
        <input id="editMax" type="number"
               min="1" step="1">

        <p id="editError" class="edit-error" role="alert"></p>

        <div class="actions">
          <button id="saveEditButton"
                  onclick="savePlanEdit()">
            Save Changes
          </button>

          <button class="secondary"
                  onclick="closePlanEdit()">
            Cancel
          </button>
        </div>
      </div>
    </div>

    
<div id="confirmOverlay" class="edit-overlay">
  <div class="edit-dialog" role="dialog"
       aria-modal="true" aria-labelledby="confirmTitle">

    <h2 id="confirmTitle">Change Plan</h2>

    <p class="muted" id="confirmDescription">
      Please confirm your plan change.
    </p>

    <div class="grid" style="grid-template-columns:1fr 1fr">
      <div class="stat">
        <small>Current Plan</small>
        <h3 id="currentPlanLabel"></h3>
        <small id="currentPlanLimit"></small>
      </div>

      <div class="stat">
        <small>New Plan</small>
        <h3 id="newPlanLabel" class="good"></h3>
        <small id="newPlanLimit"></small>
      </div>
    </div>

    <p class="muted">
      Existing usage will not be reset.
    </p>

    <p id="confirmError" class="edit-error"></p>

    <div class="actions">
      <button id="confirmChangeButton"
              onclick="confirmPlanChange()">
        Confirm Change
      </button>

      <button class="secondary"
              onclick="closeConfirm()">
        Cancel
      </button>
    </div>
  </div>
</div>


    <div class="grid">
      <section>
        <h2>Add User</h2>

        <label>User name</label>
        <input id="newUser" placeholder="User name">

        <label>User plan</label>
        <select id="addUserPlan"></select>

        <button onclick="addUser()">Add User</button>
      </section>

      <section>
        <h2>Change User Plan</h2>

        <label>User</label>
        <select id="selectedUser"
                onchange="syncUserPlan()"></select>

        <label>New user plan</label>
        <select id="changeUserPlan"></select>

        <button onclick="assignUser()">
          Apply to User
        </button>
      </section>
    </div>

    <section>
      <h2>Users & Monthly Usage</h2>

      <div style="overflow:auto">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Plan</th>
              <th>Used</th>
              <th>Monthly Limit</th>
              <th>Remaining</th>
            </tr>
          </thead>
          <tbody id="usersBody"></tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Request History</h2>

      <button class="secondary" onclick="showHistory()">
        Load Recent History
      </button>

      <pre id="history">Click to load.</pre>
    </section>

    <section>
      <h2>API Response / Messages</h2>
      <pre id="output">Ready.</pre>
    </section>

    <script>
      const $ = id => document.getElementById(id);

      let plans = [];
      let users = [];
      let usage = null;
      let account = null;
      let editingPlanId = null;

      const escapeHtml = value =>
        String(value ?? '').replace(/[&<>"']/g, c => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[c]));

      const options = arr =>
        arr.map(x =>
          '<option value="' + escapeHtml(x.id) + '">' +
          escapeHtml(x.name) +
          '</option>'
        ).join('');

      async function call(path, method = 'GET', body) {
        const r = await fetch('/manage' + path, {
          method,
          headers: { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body)
        });

        const data = await r.json();

        $('output').textContent = JSON.stringify(data, null, 2);

        if (r.status === 401) {
          throw Error('Session expired. Select a company again.');
        }

        if (!r.ok) {
          throw Error(data.error || 'HTTP ' + r.status);
        }

        return data;
      }

      async function act(fn) {
        try {
          await fn();
        } catch (error) {
          $('output').textContent = 'Error: ' + error.message;
        }
      }

      async function refresh() {
        await act(async () => {
          [account, plans, users, usage] = await Promise.all([
            call('/api/account'),
            call('/api/plans'),
            call('/api/users'),
            call('/api/usage')
          ]);

          const a = usage.account;
          $('currentCompany').textContent = account.name;

          $('overview').innerHTML =
            '<div class="stat">Company<strong>' +
            escapeHtml(account.name) +
            '</strong><small>Plan: ' +
            escapeHtml(account.plan_name) +
            '</small></div>' +

            '<div class="stat">Monthly Usage<strong>' +
            a.used + ' / ' + a.monthlyLimit +
            '</strong><small>' + a.remaining +
            ' remaining</small></div>' +

            '<div class="stat">Users<strong>' +
            users.length +
            '</strong><small>Account users</small></div>';

          const accountPlans = plans.filter(
            p => p.scope === 'account'
          );

          const userPlans = plans.filter(
            p => p.scope === 'user'
          );

          $('accountPlan').innerHTML = options(accountPlans);
          $('accountPlan').value = account.plan_id;

          $('addUserPlan').innerHTML = options(userPlans);
          $('changeUserPlan').innerHTML = options(userPlans);
          $('selectedUser').innerHTML = options(users);

          syncUserPlan();

          const tbody = $('plansBody');
          tbody.replaceChildren();

          for (const p of plans) {
            const row = document.createElement('tr');

            for (const value of [
              p.name,
              p.scope,
              p.monthly_limit,
              p.max_per_request,
              p.predefined ? 'Predefined' : 'Custom'
            ]) {
              const cell = document.createElement('td');
              cell.textContent = value;
              row.append(cell);
            }

            const action = document.createElement('td');

            if (!p.predefined) {
              const button = document.createElement('button');
              button.className = 'secondary';
              button.textContent = 'Edit';
              button.onclick = () => editPlan(p.id);
              action.append(button);
            } else {
              action.textContent = '—';
            }

            row.append(action);
            tbody.append(row);
          }

          const usersBody = $('usersBody');
          usersBody.replaceChildren();

          for (const u of usage.users) {
            const details = users.find(x => x.id === u.id);
            const row = document.createElement('tr');

            for (const value of [
              u.name,
              details?.plan_name || '',
              u.used,
              u.monthlyLimit,
              u.remaining
            ]) {
              const cell = document.createElement('td');
              cell.textContent = value;
              row.append(cell);
            }

            usersBody.append(row);
          }
        });
      }

      function syncUserPlan() {
        const u = users.find(
          x => x.id === $('selectedUser').value
        );

        if (u) {
          $('changeUserPlan').value = u.plan_id;
        }
      }

      async function createPlan() {
        await act(async () => {
          await call('/api/plans', 'POST', {
            name: $('newName').value.trim(),
            scope: $('newScope').value,
            monthlyLimit: Number($('newMonthly').value),
            maxPerRequest: Number($('newMax').value)
          });

          $('newName').value = '';
          await refresh();
        });
      }

      // ===========================
      // NEW CUSTOM PLAN EDIT MODAL
      // ===========================

      function editPlan(id) {
        const plan = plans.find(p => p.id === id);

        if (!plan || plan.predefined) return;

        editingPlanId = id;

        $('editPlanName').textContent = plan.name;
        $('editMonthly').value = plan.monthly_limit;
        $('editMax').value = plan.max_per_request;
        $('editError').textContent = '';

        $('editOverlay').classList.add('open');
        $('editMonthly').focus();
      }

      function closePlanEdit() {
        $('editOverlay').classList.remove('open');
        editingPlanId = null;
        $('editError').textContent = '';
      }

      async function savePlanEdit() {
        if (!editingPlanId) return;

        const monthly = Number($('editMonthly').value);
        const max = Number($('editMax').value);

        if (
          $('editMonthly').value.trim() === '' ||
          $('editMax').value.trim() === '' ||
          !Number.isSafeInteger(monthly) ||
          !Number.isSafeInteger(max) ||
          monthly < 0 ||
          max < 1
        ) {
          $('editError').textContent =
            'Please enter valid whole-number limits.';
          return;
        }

        const button = $('saveEditButton');
        button.disabled = true;
        button.textContent = 'Saving...';
        $('editError').textContent = '';

        try {
          await call('/api/plans/' + editingPlanId, 'PATCH', {
            monthlyLimit: monthly,
            maxPerRequest: max
          });

          await refresh();
          closePlanEdit();
        } catch (error) {
          $('editError').textContent = error.message;
        } finally {
          button.disabled = false;
          button.textContent = 'Save Changes';
        }
      }

        
let pendingPlanChange = null;

function openPlanConfirmation(type, current, selected, userId = null) {
  if (!selected) return;

  pendingPlanChange = {
    type,
    planId: selected.id,
    userId
  };

  $('confirmTitle').textContent =
    type === 'account'
      ? 'Change Company Plan'
      : 'Change User Plan';

  $('confirmDescription').textContent =
    type === 'account'
      ? 'Are you sure you want to change the company plan?'
      : 'Are you sure you want to change this user plan?';

  $('currentPlanLabel').textContent =
    current?.name || 'Current Plan';

  $('currentPlanLimit').textContent =
    (current?.monthly_limit ?? '—') + ' units/month';

  $('newPlanLabel').textContent = selected.name;

  $('newPlanLimit').textContent =
    selected.monthly_limit + ' units/month';

  $('confirmError').textContent = '';
  $('confirmOverlay').classList.add('open');
}

function closeConfirm() {
  $('confirmOverlay').classList.remove('open');
  pendingPlanChange = null;
  $('confirmError').textContent = '';
}

function assignAccount() {
  const current = plans.find(p => p.id === account.plan_id);
  const selected = plans.find(p => p.id === $('accountPlan').value);

  if (!selected || selected.id === account.plan_id) {
    $('output').textContent = 'No plan change selected.';
    return;
  }

  openPlanConfirmation('account', current, selected);
}

async function confirmPlanChange() {
  if (!pendingPlanChange) return;

  const change = pendingPlanChange;
  const button = $('confirmChangeButton');

  button.disabled = true;
  button.textContent = 'Applying...';
  $('confirmError').textContent = '';

  try {
    if (change.type === 'account') {
      await call('/api/account/plan', 'PATCH', {
        planId: change.planId
      });
    } else {
      await call(
        '/api/users/' + change.userId + '/plan',
        'PATCH',
        { planId: change.planId }
      );
    }

    await refresh();
    closeConfirm();
  } catch (error) {
    $('confirmError').textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Confirm Change';
  }
}


      async function addUser() {
        await act(async () => {
          await call('/api/users', 'POST', {
            name: $('newUser').value.trim(),
            planId: $('addUserPlan').value
          });

          $('newUser').value = '';
          await refresh();
        });
      }

      
function assignUser() {
  const userId = $('selectedUser').value;

  const user = users.find(u => u.id === userId);

  const current = plans.find(
    p => p.id === user?.plan_id
  );

  const selected = plans.find(
    p => p.id === $('changeUserPlan').value
  );

  if (!user || !selected) {
    $('output').textContent = 'Please select a user and plan.';
    return;
  }

  if (selected.id === user.plan_id) {
    $('output').textContent = 'This user already has that plan.';
    return;
  }

  openPlanConfirmation('user', current, selected, userId);
}


      async function showHistory() {
        await act(async () => {
          $('history').textContent = JSON.stringify(
            await call('/api/history?limit=30'),
            null,
            2
          );
        });
      }

      async function logout() {
        await fetch('/logout', { method: 'POST' });
        window.location.href = '/';
      }

      refresh();
    </script>
    </body></html>`
  );
});

// ===============================
// USER DEMO
// ===============================

app.get('/demo', requireLogin, (_req, res) => {
  res.type('html').send(
    head('User Demo', 'demo') + `
    <h1>User Demo</h1>

    <p>
      Simulate an operation that consumes quota units.
      Rejected requests do not consume units.
    </p>

    <section>
      <h2>Consume Units</h2>

      <label>User</label>
      <select id="user"></select>

      <label>Units</label>
      <input id="units" type="number"
             min="1" step="1" value="1">

      <button onclick="consume()">
        Generate Image (simulate)
      </button>

      <button class="secondary" onclick="loadUsers()">
        Refresh Users
      </button>
    </section>

    <section>
      <h2>Result</h2>
      <div id="status"></div>
      <pre id="output">Ready.</pre>
    </section>

    <script>
      const $ = id => document.getElementById(id);

      async function loadUsers() {
        try {
          const r = await fetch('/demo-api/users');
          const data = await r.json();

          if (!r.ok) {
            throw Error(data.error || 'Unable to load users');
          }

          const select = $('user');
          select.replaceChildren();

          for (const user of data) {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent =
              user.name + ' (' + user.plan_name + ')';
            select.append(option);
          }
        } catch (error) {
          $('output').textContent = 'Error: ' + error.message;
        }
      }

      async function consume() {
        try {
          const r = await fetch('/demo-api/consume', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              userId: $('user').value,
              units: Number($('units').value),
              requestId: crypto.randomUUID()
            })
          });

          const data = await r.json();

          $('output').textContent =
            JSON.stringify(data, null, 2);

          $('status').replaceChildren();

          const heading = document.createElement('h2');

          if (!r.ok) {
            heading.textContent = 'Request Error';
            heading.className = 'bad';
          } else if (data.accepted) {
            heading.textContent = 'Accepted ✓';
            heading.className = 'good';
          } else {
            heading.textContent = 'Rejected ✕';
            heading.className = 'bad';
          }

          $('status').append(heading);

          if (r.ok && !data.accepted) {
            const reason = document.createElement('p');
            reason.textContent =
              'Reason: ' + data.reason +
              ' (' + data.level + ')';
            $('status').append(reason);
          }
        } catch (error) {
          $('output').textContent = 'Error: ' + error.message;
        }
      }

      loadUsers();
    </script>
    </body></html>`
  );
});

// ===============================
// START CLIENT
// ===============================

app.listen(8080, '0.0.0.0', () => {
  console.log('Client ready at http://localhost:8080');
});
