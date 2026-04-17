import { auth } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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

// Global modal dismissal: hides overlay and clears injected form content
// so that the next module using the modal starts from a clean state.
export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden', 'true');
  if (content) content.innerHTML = '';
}

// Helper exposed to data modules so they can prepare the modal body.
export function openModal(title) {
  document.getElementById('modal-title').textContent = title;
  const overlay = document.getElementById('modal-overlay');
  overlay.style.display = 'flex';
  overlay.setAttribute('aria-hidden', 'false');
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
