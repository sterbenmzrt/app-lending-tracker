import { auth, db } from './firebase.js';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// Helper UI Messaging
function showMsg(el, msg, isError = true) {
  el.textContent = msg;
  el.classList.remove('hidden');
  if (isError) {
    el.classList.add('text-red-600', 'bg-red-50', 'border-red-200');
    el.classList.remove('text-emerald-600', 'bg-emerald-50', 'border-emerald-200');
  } else {
    el.classList.add('text-emerald-600', 'bg-emerald-50', 'border-emerald-200');
    el.classList.remove('text-red-600', 'bg-red-50', 'border-red-200');
  }
}

function hideMsg(el) {
  el.classList.add('hidden');
}

function getAuthErrorMsg(errCode) {
  switch(errCode) {
    case 'auth/invalid-email': return 'Format email tidak valid.';
    case 'auth/user-disabled': return 'Akun ini dinonaktifkan.';
    case 'auth/user-not-found': return 'Akun tidak ditemukan. Silakan mendaftar.';
    case 'auth/wrong-password': return 'Password salah.';
    case 'auth/invalid-credential': return 'Email atau kredensial salah.';
    case 'auth/email-already-in-use': return 'Email ini terdaftar. Silakan login.';
    case 'auth/weak-password': return 'Password terlalu pendek/lemah.';
    case 'auth/too-many-requests': return 'Terlalu banyak percobaan. Coba lagi nanti.';
    default: return 'Kesalahan tidak diketahui: ' + errCode;
  }
}

if (document.getElementById('login-form')) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const forgotForm = document.getElementById('forgot-form');
  
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const tabsContainer = document.getElementById('auth-tabs-container');
  const linkForgot = document.getElementById('link-forgot');
  const btnBackLogin = document.getElementById('btn-back-login');

  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');
  const forgotError = document.getElementById('forgot-error');

  const switchTabs = (isLogin) => {
    hideMsg(loginError); hideMsg(registerError); hideMsg(forgotError);
    clearInvalid([loginForm, registerForm, forgotForm]);
    if (isLogin) {
      tabLogin.className = "pb-2 text-sm font-semibold border-b-2 border-brand text-brand";
      tabRegister.className = "pb-2 text-sm font-medium border-b-2 border-transparent text-zinc-700 hover:text-zinc-900";
      tabLogin.setAttribute('aria-selected', 'true');
      tabRegister.setAttribute('aria-selected', 'false');
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
      forgotForm.classList.add('hidden');
      tabsContainer.classList.remove('hidden');
    } else {
      tabRegister.className = "pb-2 text-sm font-semibold border-b-2 border-brand text-brand";
      tabLogin.className = "pb-2 text-sm font-medium border-b-2 border-transparent text-zinc-700 hover:text-zinc-900";
      tabRegister.setAttribute('aria-selected', 'true');
      tabLogin.setAttribute('aria-selected', 'false');
      registerForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
      forgotForm.classList.add('hidden');
      tabsContainer.classList.remove('hidden');
    }
  };

  const clearInvalid = (forms) => {
    forms.forEach(f => f.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid')));
  };

  const markInvalid = (form) => {
    form.querySelectorAll('input[required]').forEach(el => {
      if (!el.value) el.setAttribute('aria-invalid', 'true');
    });
  };

  tabLogin.addEventListener('click', () => switchTabs(true));
  tabRegister.addEventListener('click', () => switchTabs(false));

  linkForgot.addEventListener('click', () => {
    hideMsg(loginError);
    loginForm.classList.add('hidden');
    tabsContainer.classList.add('hidden');
    forgotForm.classList.remove('hidden');
  });

  btnBackLogin.addEventListener('click', () => switchTabs(true));

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMsg(loginError);
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    const btn = loginForm.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Memproses...';
    btn.disabled = true;

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      if (!userCredential.user.emailVerified) {
        await signOut(auth);
        showMsg(loginError, 'Verifikasi email Anda terlebih dahulu, periksa Inbox / Spam.', true);
      }
    } catch (error) {
      showMsg(loginError, getAuthErrorMsg(error.code), true);
      markInvalid(loginForm);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMsg(registerError);
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    const btn = registerForm.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Membuat Akun...';
    btn.disabled = true;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      await sendEmailVerification(user);
      
      await set(ref(db, 'users/' + user.uid), {
        displayName: name,
        email: email,
        phone: '',
        createdAt: new Date().toISOString()
      });

      await signOut(auth);
      showMsg(registerError, 'Pendaftaran berhasil. Tautan verifikasi dikirim ke email kamu.', false);
      registerForm.reset();

    } catch (error) {
      showMsg(registerError, getAuthErrorMsg(error.code), true);
      markInvalid(registerForm);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });

  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMsg(forgotError);
    const email = document.getElementById('forgot-email').value;
    
    const btn = forgotForm.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'Mengirim...';
    btn.disabled = true;

    try {
      await sendPasswordResetEmail(auth, email);
      showMsg(forgotError, 'Link reset password berhasil dikirim.', false);
      forgotForm.reset();
    } catch (error) {
      showMsg(forgotError, getAuthErrorMsg(error.code), true);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}

onAuthStateChanged(auth, (user) => {
  const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '';
  
  if (user && user.emailVerified) {
    if (isLoginPage) {
      window.location.href = 'app.html';
    } else {
      if (document.body.classList.contains('app-body')) {
        document.body.style.display = 'flex';
        document.body.classList.remove('hidden');
        window.currentUserUid = user.uid;
        document.dispatchEvent(new Event('auth-ready'));
      }
    }
  } else {
    if (!isLoginPage) {
      window.location.href = 'index.html';
    }
  }
});
