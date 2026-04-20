import { db } from './firebase.js';
import { openModal, closeModal, showToast, downloadCSV } from './app.js';
import {
  ref, push, set, update, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

let itemsCache = {};

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function loadItems() {
  const uid = window.currentUserUid;
  const itemsRef = ref(db, `users/${uid}/items`);
  onValue(itemsRef, (snapshot) => {
    itemsCache = snapshot.val() || {};
    renderItemsTable(itemsCache);
    renderItemsStats(itemsCache);
  });
}

function renderItemsStats(data) {
  const values = Object.values(data);
  const totalQty = values.reduce((sum, it) => sum + (parseInt(it.quantity, 10) || 0), 0);
  const uniqueEl = document.getElementById('stat-items-unique');
  const qtyEl = document.getElementById('stat-items-qty');
  if (uniqueEl) uniqueEl.textContent = values.length;
  if (qtyEl) qtyEl.textContent = totalQty;
}

function exportItemsCSV() {
  const entries = Object.values(itemsCache);
  if (entries.length === 0) {
    showToast('No items to export.', 'error');
    return;
  }
  const rows = [['Item Name', 'Quantity', 'Created At']];
  entries.forEach(it => rows.push([it.name || '', it.quantity ?? 1, it.createdAt || '']));
  downloadCSV(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  showToast('Inventory CSV downloaded.');
}

function renderItemsTable(data) {
  const tbody = document.getElementById('inventory-tbody');
  const entries = Object.entries(data);

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center" style="color: var(--text-secondary);">
      No items yet. Click "+ New Item" to add one.</td></tr>`;
    return;
  }

  tbody.innerHTML = entries
    .sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''))
    .map(([id, it]) => `
      <tr>
        <td>${escapeHtml(it.name)}</td>
        <td>${escapeHtml(String(it.quantity ?? 1))}</td>
        <td>
          <button class="btn-text" data-action="edit" data-id="${id}">Edit</button>
          <button class="btn-text text-danger" data-action="delete" data-id="${id}">Delete</button>
        </td>
      </tr>
    `).join('');

  tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openItemModal(btn.dataset.id));
  });
  tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.dataset.id));
  });
}

function openItemModal(id = null) {
  const isEdit = Boolean(id);
  const it = isEdit ? (itemsCache[id] || {}) : { name: '', quantity: 1 };

  openModal(isEdit ? 'Edit Item' : 'New Item');
  document.getElementById('modal-content').innerHTML = `
    <form id="item-form" class="auth-form" novalidate>
      <div class="form-group">
        <label for="i-name">Item Name</label>
        <input type="text" id="i-name" required value="${escapeHtml(it.name || '')}">
      </div>
      <div class="form-group">
        <label for="i-qty">Quantity</label>
        <input type="number" id="i-qty" min="1" value="${escapeHtml(String(it.quantity ?? 1))}">
      </div>
      <div id="i-error" class="error-msg" aria-live="polite"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Save'}</button>
      </div>
    </form>
  `;

  document.getElementById('item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('i-name').value.trim();
    const quantity = parseInt(document.getElementById('i-qty').value, 10) || 1;
    const errEl = document.getElementById('i-error');

    if (!name) {
      errEl.textContent = 'Item name is required.';
      return;
    }
    if (quantity < 1) {
      errEl.textContent = 'Quantity must be at least 1.';
      return;
    }
    try {
      await saveItem(id, { name, quantity });
      closeModal();
      showToast(isEdit ? 'Item updated.' : 'Item created.');
    } catch (err) {
      errEl.textContent = 'Failed to save: ' + err.message;
    }
  });
}

async function saveItem(id, data) {
  const uid = window.currentUserUid;
  if (id) {
    await update(ref(db, `users/${uid}/items/${id}`), {
      ...data,
      updatedAt: new Date().toISOString()
    });
  } else {
    const newRef = push(ref(db, `users/${uid}/items`));
    await set(newRef, {
      ...data,
      createdAt: new Date().toISOString()
    });
  }
}

async function deleteItem(id) {
  const it = itemsCache[id];
  if (!it) return;
  if (!confirm(`Delete item "${it.name}"? This cannot be undone.`)) return;
  const uid = window.currentUserUid;
  try {
    await remove(ref(db, `users/${uid}/items/${id}`));
    showToast('Item deleted.');
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}

export function getItemsCache() {
  return itemsCache;
}

document.addEventListener('auth-ready', () => {
  loadItems();
  const btn = document.getElementById('btn-export-items');
  if (btn) btn.addEventListener('click', exportItemsCSV);
});

document.addEventListener('request-create', (e) => {
  if (e.detail.view === 'inventory') openItemModal();
});
