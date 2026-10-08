(function () {
  'use strict';

  const ADMIN_EMAIL = 'admin@tesla.school';
  const ADMIN_PASSWORD = 'Admin123!';

  function $(selector) { return document.querySelector(selector); }
  function show(el) { if (el) el.classList.add('show'); }
  function close(el) { if (el) el.classList.remove('show'); }
  function users() {
    try { return JSON.parse(localStorage.getItem('tm_users') || '[]'); }
    catch (_) { return []; }
  }
  function saveUsers(u) { localStorage.setItem('tm_users', JSON.stringify(u)); }
  function money(n) {
    return '$' + Number(n || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }

  function init() {
    const login = $('#login');
    const app = $('#app');
    const email = $('#email');
    const password = $('#password');
    const loginBtn = $('#loginBtn');
    const logout = $('#logout');
    const modal = $('#modal');
    const body = $('#body');
    const closeBtn = $('#close');

    if (!loginBtn || !email || !password || !login || !app) {
      console.error('Admin login elements are missing.');
      return;
    }

    function start() {
      if (sessionStorage.getItem('tm_admin') !== '1') return;
      login.classList.add('hidden');
      app.classList.remove('hidden');
      render();
    }

    loginBtn.addEventListener('click', function () { window.adminLogin && window.adminLogin(); });

    password.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') loginBtn.click();
    });
    email.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') loginBtn.click();
    });

    if (logout) logout.addEventListener('click', function () {
      sessionStorage.removeItem('tm_admin');
      location.reload();
    });

    function render() {
      const u = users();
      $('#users').textContent = u.length;
      $('#total').textContent = money(u.reduce((s, x) => s + Number(x.balance || 0), 0));
      let w = [], d = [];
      try { w = JSON.parse(localStorage.getItem('tm_withdrawals') || '[]'); } catch (_) {}
      try { d = JSON.parse(localStorage.getItem('tm_deposits') || '[]'); } catch (_) {}
      $('#pending').textContent = w.filter(x => x.status === 'Pending').length;
      $('#funding').textContent = d.filter(x => x.status === 'Pending').length;

      $('#customers').innerHTML = u.length ? u.map((x, i) =>
        `<tr><td><b>${x.name || ''}</b><br><span class="muted">${x.email || ''}</span></td><td>${money(x.balance)}</td><td>${money(x.invested)}</td><td>${money(x.profit)}</td><td><div class="control"><button onclick="adjust(${i},'balance')">Balance</button><button onclick="adjust(${i},'profit')">Profit</button></div></td></tr>`
      ).join('') : '<tr><td colspan="5">No customers yet.</td></tr>';

      $('#withdrawals').innerHTML = w.length ? w.slice().reverse().map((x, ri) =>
        `<div class="req"><div><b>${x.name || ''} — ${money(x.amount)}</b><span class="muted">${x.method || ''} · ${x.destination || ''} · ${x.status || ''}</span></div><div>${x.status === 'Pending' ? `<button class="approve" onclick="decision(${w.length - 1 - ri},'Approved')">Approve</button><button class="reject" onclick="decision(${w.length - 1 - ri},'Rejected')">Reject</button>` : ''}</div></div>`
      ).join('') : '<p class="muted">No withdrawal requests.</p>';

      $('#deposits').innerHTML = d.length ? d.slice().reverse().map((x, ri) =>
        `<div class="req"><div><b>${x.email || ''} — ${money(x.amount)}</b><span class="muted">${x.status || ''} · ${x.date || ''}</span></div><div>${x.status === 'Pending' ? `<button class="approve" onclick="fundDecision(${d.length - 1 - ri},'Approved')">Approve</button><button class="reject" onclick="fundDecision(${d.length - 1 - ri},'Rejected')">Reject</button>` : ''}</div></div>`
      ).join('') : '<p class="muted">No funding requests.</p>';
    }

    window.renderAdmin = render;

    window.adjust = function (i, type) {
      const u = users();
      const x = u[i];
      if (!x) return;
      body.innerHTML = `<h2>Adjust ${type}</h2><p>${x.name || ''}</p><form class="form" id="adj"><input name="amount" type="number" step="0.01" required placeholder="New ${type} amount"><button>Save</button></form>`;
      show(modal);
      $('#adj').addEventListener('submit', function (e) {
        e.preventDefault();
        const amount = Number(new FormData(e.target).get('amount'));
        x[type] = amount;
        saveUsers(u);
        close(modal);
        render();
      });
    };

    window.decision = function (i, status) {
      let w = JSON.parse(localStorage.getItem('tm_withdrawals') || '[]');
      if (!w[i]) return;
      w[i].status = status;
      localStorage.setItem('tm_withdrawals', JSON.stringify(w));
      render();
    };

    window.fundDecision = function (i, status) {
      let d = JSON.parse(localStorage.getItem('tm_deposits') || '[]');
      if (!d[i]) return;
      if (status === 'Approved') {
        const u = users();
        const x = u.find(q => q.email === d[i].email);
        if (x) {
          x.balance = Number(x.balance || 0) + Number(d[i].amount || 0);
          saveUsers(u);
        }
      }
      d[i].status = status;
      localStorage.setItem('tm_deposits', JSON.stringify(d));
      render();
    };

    if (closeBtn) closeBtn.addEventListener('click', function () { close(modal); });
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) close(modal); });

    start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
