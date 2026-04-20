import { db } from './firebase.js';
import { openModal, closeModal, showToast, downloadCSV } from './app.js';
import { getContactsCache } from './contacts.js';
import { getItemsCache } from './items.js';
import {
  ref, push, set, update, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

let loansCache = {};

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Derives badge content. A loan is "Overdue" only when still unreturned
// AND past its due date, otherwise it is "Borrowed" or "Returned".
function getStatusBadge(loan) {
  if (loan.returnedAt) {
    return `<span class="badge badge-success">Returned</span>`;
  }
  const due = new Date(loan.dueDate);
  if (!isNaN(due.getTime()) && due < new Date()) {
    return `<span class="badge badge-danger">Overdue</span>`;
  }
  return `<span class="badge badge-info">Borrowed</span>`;
}

function loadLoans() {
  const uid = window.currentUserUid;
  const loansRef = ref(db, `users/${uid}/loans`);
  onValue(loansRef, (snapshot) => {
    loansCache = snapshot.val() || {};
    renderLoansTable(loansCache);
    renderLoansStats(loansCache);
  });
}

// Dashboard widget numbers: total, active (not yet returned),
// and overdue (active + past due date). Computed on every realtime update.
function renderLoansStats(data) {
  const all = Object.values(data);
  const total = all.length;
  const active = all.filter(l => !l.returnedAt).length;
  const now = new Date();
  const overdue = all.filter(l => !l.returnedAt && l.dueDate && new Date(l.dueDate) < now).length;

  const t = document.getElementById('stat-loans-total');
  const a = document.getElementById('stat-loans-active');
  const o = document.getElementById('stat-loans-overdue');
  if (t) t.textContent = total;
  if (a) a.textContent = active;
  if (o) o.textContent = overdue;
}

function statusText(loan) {
  if (loan.returnedAt) return 'Returned';
  if (loan.dueDate && new Date(loan.dueDate) < new Date()) return 'Overdue';
  return 'Borrowed';
}

function exportLoansCSV() {
  const entries = Object.values(loansCache);
  if (entries.length === 0) {
    showToast('No loans to export.', 'error');
    return;
  }
  const rows = [['Item', 'Borrower', 'Borrow Date', 'Due Date', 'Status', 'Returned At']];
  entries.forEach(l => rows.push([
    l.itemName || '',
    l.borrowerName || '',
    l.borrowDate || '',
    l.dueDate || '',
    statusText(l),
    l.returnedAt || ''
  ]));
  downloadCSV(`loans-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  showToast('Loans CSV downloaded.');
}

function renderLoansTable(data) {
  const tbody = document.getElementById('loans-tbody');
  const entries = Object.entries(data);

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color: var(--text-secondary);">
      No loans recorded. Click "+ New Loan" to create one.</td></tr>`;
    return;
  }

  tbody.innerHTML = entries
    .sort((a, b) => (b[1].borrowDate || '').localeCompare(a[1].borrowDate || ''))
    .map(([id, l]) => `
      <tr>
        <td>${escapeHtml(l.itemName || '-')}</td>
        <td>${escapeHtml(l.borrowerName || '-')}</td>
        <td>${fmtDate(l.borrowDate)}</td>
        <td>${fmtDate(l.dueDate)}</td>
        <td>${getStatusBadge(l)}</td>
        <td>
          ${!l.returnedAt
            ? `<button class="btn-text text-success" data-action="return" data-id="${id}">Mark Returned</button>`
            : ''}
          <button class="btn-text" data-action="edit" data-id="${id}">Edit</button>
          <button class="btn-text text-danger" data-action="delete" data-id="${id}">Delete</button>
        </td>
      </tr>
    `).join('');

  tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openLoanModal(btn.dataset.id));
  });
  tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteLoan(btn.dataset.id));
  });
  tbody.querySelectorAll('button[data-action="return"]').forEach(btn => {
    btn.addEventListener('click', () => markReturned(btn.dataset.id));
  });
}

// Builds the Loan form and fills borrower/item <select> options from the
// caches maintained by contacts.js and items.js.
function openLoanModal(id = null) {
  const isEdit = Boolean(id);
  const l = isEdit ? (loansCache[id] || {}) : {
    borrowerId: '', itemId: '', borrowDate: new Date().toISOString().slice(0, 10), dueDate: ''
  };

  const contacts = getContactsCache();
  const items = getItemsCache();

  const contactOptions = Object.entries(contacts)
    .map(([cid, c]) => `<option value="${cid}" ${cid === l.borrowerId ? 'selected' : ''}>
      ${escapeHtml(c.name)}</option>`).join('');
  const itemOptions = Object.entries(items)
    .map(([iid, it]) => `<option value="${iid}" ${iid === l.itemId ? 'selected' : ''}>
      ${escapeHtml(it.name)}</option>`).join('');

  openModal(isEdit ? 'Edit Loan' : 'New Loan');

  if (!contactOptions || !itemOptions) {
    document.getElementById('modal-content').innerHTML = `
      <p style="color: var(--text-secondary); margin-bottom: 1rem;">
        You need at least one contact and one inventory item before creating a loan.
      </p>
      <div class="modal-footer">
        <button type="button" class="btn btn-primary" onclick="closeModal()">OK</button>
      </div>`;
    return;
  }

  document.getElementById('modal-content').innerHTML = `
    <form id="loan-form" class="auth-form" novalidate>
      <div class="form-group">
        <label for="l-borrower">Borrower</label>
        <select id="l-borrower" required>
          <option value="">-- Select contact --</option>
          ${contactOptions}
        </select>
      </div>
      <div class="form-group">
        <label for="l-item">Item</label>
        <select id="l-item" required>
          <option value="">-- Select item --</option>
          ${itemOptions}
        </select>
      </div>
      <div class="form-group">
        <label for="l-borrow-date">Borrow Date</label>
        <input type="date" id="l-borrow-date" required value="${escapeHtml(l.borrowDate || '')}">
      </div>
      <div class="form-group">
        <label for="l-due-date">Due Date</label>
        <input type="date" id="l-due-date" required value="${escapeHtml(l.dueDate || '')}">
      </div>
      <div id="l-error" class="error-msg" aria-live="polite"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Save'}</button>
      </div>
    </form>
  `;

  document.getElementById('loan-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const borrowerId = document.getElementById('l-borrower').value;
    const itemId = document.getElementById('l-item').value;
    const borrowDate = document.getElementById('l-borrow-date').value;
    const dueDate = document.getElementById('l-due-date').value;
    const errEl = document.getElementById('l-error');

    if (!borrowerId || !itemId || !borrowDate || !dueDate) {
      errEl.textContent = 'All fields are required.';
      return;
    }
    if (new Date(dueDate) < new Date(borrowDate)) {
      errEl.textContent = 'Due date cannot be before borrow date.';
      return;
    }

    const payload = {
      borrowerId,
      borrowerName: contacts[borrowerId]?.name || '',
      itemId,
      itemName: items[itemId]?.name || '',
      borrowDate,
      dueDate,
      returnedAt: l.returnedAt || null
    };

    try {
      await saveLoan(id, payload);
      closeModal();
      showToast(isEdit ? 'Loan updated.' : 'Loan created.');
    } catch (err) {
      errEl.textContent = 'Failed to save: ' + err.message;
    }
  });
}

async function saveLoan(id, data) {
  const uid = window.currentUserUid;
  if (id) {
    await update(ref(db, `users/${uid}/loans/${id}`), {
      ...data,
      updatedAt: new Date().toISOString()
    });
  } else {
    const newRef = push(ref(db, `users/${uid}/loans`));
    await set(newRef, {
      ...data,
      createdAt: new Date().toISOString()
    });
  }
}

async function markReturned(id) {
  const uid = window.currentUserUid;
  try {
    await update(ref(db, `users/${uid}/loans/${id}`), {
      returnedAt: new Date().toISOString()
    });
    showToast('Loan marked as returned.');
  } catch (err) {
    showToast('Failed to update: ' + err.message, 'error');
  }
}

async function deleteLoan(id) {
  const l = loansCache[id];
  if (!l) return;
  if (!confirm(`Delete this loan record for "${l.itemName}"?`)) return;
  const uid = window.currentUserUid;
  try {
    await remove(ref(db, `users/${uid}/loans/${id}`));
    showToast('Loan deleted.');
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}

document.addEventListener('auth-ready', () => {
  loadLoans();
  const btn = document.getElementById('btn-export-loans');
  if (btn) btn.addEventListener('click', exportLoansCSV);
});

document.addEventListener('request-create', (e) => {
  if (e.detail.view === 'loans') openLoanModal();
});
