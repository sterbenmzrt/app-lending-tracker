import { auth } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Generic CSV downloader. Rows is an array of arrays; the first row is treated
// as the header. Every cell is RFC 4180-quoted so commas, quotes, and
// newlines inside values survive Excel / Google Sheets import.
export function downloadCSV(filename, rows) {
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(r => r.map(escape).join(',')).join('\r\n');
  const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const VIEW_CONFIG = {
  loans:     { title: 'Loans',     action: '+ New Loan'    },
  contacts:  { title: 'Contacts',  action: '+ New Contact' },
  inventory: { title: 'Inventory', action: '+ New Item'    }
};

let currentView = 'loans';

// Multi-view navigation: toggles active sidebar item, shows/hides sections,
// updates page title and the dynamic "main action" button.
function updateView(viewName) {
  if (!VIEW_CONFIG[viewName]) return;
  currentView = viewName;

  document.querySelectorAll('.nav-item').forEach(item => {
    const isActive = item.dataset.view === viewName;
    item.classList.toggle('active', isActive);
    if (isActive) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });

  document.querySelectorAll('.data-view').forEach(section => {
    section.style.display = 'none';
  });
  const activeSection = document.getElementById(`${viewName}-view`);
  if (activeSection) activeSection.style.display = 'block';

  const cfg = VIEW_CONFIG[viewName];
  document.getElementById('page-title').textContent = cfg.title;
  document.getElementById('btn-main-action').textContent = cfg.action;
}

// Element that triggered the modal - we restore focus here on close (WCAG 2.4.3).
let lastFocusedTrigger = null;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(e) {
  const overlay = document.getElementById('modal-overlay');
  if (overlay.style.display !== 'flex') return;
  if (e.key !== 'Tab') return;
  const focusables = overlay.querySelectorAll(FOCUSABLE_SELECTOR);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// Global modal dismissal: hides overlay, clears injected form content,
// and returns focus to the element that opened the modal (WCAG 2.4.3).
export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden', 'true');
  if (content) content.innerHTML = '';
  document.removeEventListener('keydown', trapFocus);
  if (lastFocusedTrigger && typeof lastFocusedTrigger.focus === 'function') {
    lastFocusedTrigger.focus();
    lastFocusedTrigger = null;
  }
}

// Helper exposed to data modules so they can prepare the modal body.
// Saves the currently-focused element and installs a Tab focus trap.
export function openModal(title) {
  lastFocusedTrigger = document.activeElement;
  document.getElementById('modal-title').textContent = title;
  const overlay = document.getElementById('modal-overlay');
  overlay.style.display = 'flex';
  overlay.setAttribute('aria-hidden', 'false');
  document.addEventListener('keydown', trapFocus);
  // Move focus into the modal on next tick (after content injection)
  setTimeout(() => {
    const first = overlay.querySelector(FOCUSABLE_SELECTOR);
    if (first) first.focus();
  }, 0);
}

// Lightweight toast used by every data module to confirm writes.
export function showToast(message, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show toast-${type}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.className = 'toast'; }, 2600);
}

document.addEventListener('auth-ready', () => {

  const emailEl = document.getElementById('user-email');
  if (emailEl && auth.currentUser) {
    emailEl.textContent = auth.currentUser.email || '-';
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      updateView(item.dataset.view);
    });
  });

  document.getElementById('btn-signout').addEventListener('click', async () => {
    try {
      await signOut(auth);
    } catch (err) {
      showToast('Failed to sign out: ' + err.message, 'error');
    }
  });

  document.getElementById('modal-close-x').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('modal-overlay').style.display === 'flex') {
      closeModal();
    }
  });

  // Dynamic header action: route the click to the module handler
  // that matches the currently visible view.
  document.getElementById('btn-main-action').addEventListener('click', () => {
    const event = new CustomEvent('request-create', { detail: { view: currentView } });
    document.dispatchEvent(event);
  });

  updateView('loans');
});

window.closeModal = closeModal;
