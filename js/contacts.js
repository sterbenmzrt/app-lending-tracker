import { db } from './firebase.js';
import { openModal, closeModal, showToast } from './app.js';
import {
  ref, push, set, update, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

let contactsCache = {};

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Realtime subscription: re-renders the table whenever the user's
// /contacts node changes in Firebase Realtime Database.
function loadContacts() {
  const uid = window.currentUserUid;
  const contactsRef = ref(db, `users/${uid}/contacts`);
  onValue(contactsRef, (snapshot) => {
    contactsCache = snapshot.val() || {};
    renderContactsTable(contactsCache);
  });
}

function renderContactsTable(data) {
  const tbody = document.getElementById('contacts-tbody');
  const entries = Object.entries(data);

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center" style="color: var(--text-secondary);">
      No contacts yet. Click "+ New Contact" to add one.</td></tr>`;
    return;
  }

  tbody.innerHTML = entries
    .sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''))
    .map(([id, c]) => `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.phone || '-')}</td>
        <td>
          <button class="btn-text" data-action="edit" data-id="${id}">Edit</button>
          <button class="btn-text text-danger" data-action="delete" data-id="${id}">Delete</button>
        </td>
      </tr>
    `).join('');

  tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openContactModal(btn.dataset.id));
  });
  tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteContact(btn.dataset.id));
  });
}

// Opens the shared modal in either "Create" or "Edit" mode, populated
// with existing record values when an id is supplied.
function openContactModal(id = null) {
  const isEdit = Boolean(id);
  const c = isEdit ? (contactsCache[id] || {}) : { name: '', phone: '' };

  openModal(isEdit ? 'Edit Contact' : 'New Contact');
  document.getElementById('modal-content').innerHTML = `
    <form id="contact-form" class="auth-form" novalidate>
      <div class="form-group">
        <label for="c-name">Full Name</label>
        <input type="text" id="c-name" required value="${escapeHtml(c.name || '')}">
      </div>
      <div class="form-group">
        <label for="c-phone">Phone</label>
        <input type="tel" id="c-phone" value="${escapeHtml(c.phone || '')}" placeholder="Optional">
      </div>
      <div id="c-error" class="error-msg" aria-live="polite"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Save'}</button>
      </div>
    </form>
  `;

  document.getElementById('contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('c-name').value.trim();
    const phone = document.getElementById('c-phone').value.trim();
    const errEl = document.getElementById('c-error');

    if (!name) {
      errEl.textContent = 'Name is required.';
      return;
    }
    try {
      await saveContact(id, { name, phone });
      closeModal();
      showToast(isEdit ? 'Contact updated.' : 'Contact created.');
    } catch (err) {
      errEl.textContent = 'Failed to save: ' + err.message;
    }
  });
}

async function saveContact(id, data) {
  const uid = window.currentUserUid;
  if (id) {
    await update(ref(db, `users/${uid}/contacts/${id}`), {
      ...data,
      updatedAt: new Date().toISOString()
    });
  } else {
    const newRef = push(ref(db, `users/${uid}/contacts`));
    await set(newRef, {
      ...data,
      createdAt: new Date().toISOString()
    });
  }
}

async function deleteContact(id) {
  const c = contactsCache[id];
  if (!c) return;
  if (!confirm(`Delete contact "${c.name}"? This cannot be undone.`)) return;
  const uid = window.currentUserUid;
  try {
    await remove(ref(db, `users/${uid}/contacts/${id}`));
    showToast('Contact deleted.');
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}

// Expose the live cache so the Loans module can build a borrower dropdown
// without opening a second Firebase subscription.
export function getContactsCache() {
  return contactsCache;
}

document.addEventListener('auth-ready', () => {
  loadContacts();
});

document.addEventListener('request-create', (e) => {
  if (e.detail.view === 'contacts') openContactModal();
});
