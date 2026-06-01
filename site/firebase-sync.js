/**
 * firebase-sync.js — Cross-device progress sync via Firebase Firestore.
 *
 * Requires (loaded before this script):
 *   - firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js (CDN)
 *   - firebase-config.js (sets window.AIFS_FIREBASE_CONFIG)
 *   - progress.js (sets window.AIFSProgress)
 *
 * Firestore document path:
 *   users/{uid}/progress/aifs  →  same JSON schema as aifs:progress:v1
 *
 * Behaviour:
 *   - Injects a "Sync" button into .header-nav
 *   - Google sign-in popup
 *   - On sign-in: pulls Firestore, merges with localStorage (union; newer wins), writes back
 *   - On any local progress change: debounced push to Firestore
 *   - On sign-out: reverts button; local progress unchanged
 */
(function () {
  'use strict';

  var STORAGE_KEY      = 'aifs:progress:v1';
  var PUSH_DEBOUNCE_MS = 2000;

  // Guard: only activate when a real config is present
  if (
    !window.AIFS_FIREBASE_CONFIG ||
    window.AIFS_FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY'
  ) {
    return;
  }

  var app, auth, db;
  try {
    app  = firebase.initializeApp(window.AIFS_FIREBASE_CONFIG);
    auth = firebase.auth();
    db   = firebase.firestore();
  } catch (e) {
    console.warn('[aifs-firebase] init failed', e);
    return;
  }

  var currentUser = null;
  var pushTimer   = null;

  // ── localStorage helpers ──────────────────────────────────────────────────

  function getLocalState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { lessons: {}, updatedAt: 0 };
      var s = JSON.parse(raw);
      return (s && s.lessons) ? s : { lessons: {}, updatedAt: 0 };
    } catch (e) {
      return { lessons: {}, updatedAt: 0 };
    }
  }

  function setLocalState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // Re-use progress.js's cross-tab storage listener to notify its onChange callbacks
  function notifyProgressListeners() {
    try {
      window.dispatchEvent(new StorageEvent('storage', {
        key:      STORAGE_KEY,
        newValue: localStorage.getItem(STORAGE_KEY)
      }));
    } catch (e) {}
  }

  // ── Firestore helpers ─────────────────────────────────────────────────────

  function docRef(uid) {
    return db.collection('users').doc(uid).collection('progress').doc('aifs');
  }

  /**
   * Merge two progress states: union of lessons; per-lesson take the most
   * complete data (answers merged by key, completedAt kept if either set,
   * visitedAt takes the maximum).
   */
  function mergeStates(local, remote) {
    var merged = {
      lessons:   {},
      updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0)
    };
    var keys = {};
    Object.keys(local.lessons  || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(remote.lessons || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (path) {
      var l = (local.lessons  || {})[path];
      var r = (remote.lessons || {})[path];
      if (!l) { merged.lessons[path] = r; return; }
      if (!r) { merged.lessons[path] = l; return; }
      merged.lessons[path] = {
        answers:     Object.assign({}, r.answers || {}, l.answers || {}),
        completedAt: l.completedAt || r.completedAt,
        visitedAt:   Math.max(l.visitedAt || 0, r.visitedAt || 0)
      };
    });
    return merged;
  }

  function pushToFirestore() {
    if (!currentUser) return;
    var state = getLocalState();
    setSyncDot('syncing');
    docRef(currentUser.uid).set(state)
      .then(function ()  { setSyncDot('ok'); })
      .catch(function (e) {
        setSyncDot('error');
        console.warn('[aifs-firebase] push failed', e);
      });
  }

  function schedulePush() {
    if (!currentUser) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushToFirestore, PUSH_DEBOUNCE_MS);
  }

  function pullAndMerge(uid) {
    setSyncDot('syncing');
    return docRef(uid).get()
      .then(function (snap) {
        var remote = snap.exists ? snap.data() : { lessons: {}, updatedAt: 0 };
        var merged = mergeStates(getLocalState(), remote);
        setLocalState(merged);
        notifyProgressListeners();
        setSyncDot('ok');
      })
      .catch(function (e) {
        setSyncDot('error');
        console.warn('[aifs-firebase] pull failed', e);
      });
  }

  // ── Auth UI ───────────────────────────────────────────────────────────────

  function injectButton() {
    if (document.getElementById('aifsAuthBtn')) return;
    var nav = document.querySelector('.header-nav');
    if (!nav) return;

    var btn = document.createElement('a');
    btn.id        = 'aifsAuthBtn';
    btn.className = 'header-github aifs-auth-btn';
    btn.href      = '#';
    btn.setAttribute('title', 'Sign in with Google to sync progress across devices');
    btn.setAttribute('aria-label', 'Sync progress');
    btn.setAttribute('role', 'button');
    btn.innerHTML =
      '<span class="aifs-auth-label" id="aifsAuthLabel">Sync</span>' +
      '<span class="aifs-sync-dot" id="aifsSyncDot"></span>';
    btn.addEventListener('click', function (e) { e.preventDefault(); handleAuthClick(); });
    nav.appendChild(btn);
  }

  function handleAuthClick() {
    if (currentUser) {
      if (window.confirm('Sign out of Firebase sync? Your local progress stays saved.')) {
        auth.signOut();
      }
    } else {
      var provider = new firebase.auth.GoogleAuthProvider();
      auth.signInWithPopup(provider).catch(function (e) {
        console.warn('[aifs-firebase] sign-in failed', e);
      });
    }
  }

  function updateButtonLabel(user) {
    var label = document.getElementById('aifsAuthLabel');
    var btn   = document.getElementById('aifsAuthBtn');
    if (!label || !btn) return;
    if (user) {
      var name = user.displayName
        ? user.displayName.split(' ')[0]
        : user.email.split('@')[0];
      label.textContent = name;
      btn.setAttribute('title',
        'Signed in as ' + (user.displayName || user.email) + ' — click to sign out');
    } else {
      label.textContent = 'Sync';
      btn.setAttribute('title', 'Sign in with Google to sync progress across devices');
    }
  }

  function setSyncDot(state) {
    var dot = document.getElementById('aifsSyncDot');
    if (dot) dot.setAttribute('data-sync', state);
  }

  // ── Auth state ────────────────────────────────────────────────────────────

  auth.onAuthStateChanged(function (user) {
    currentUser = user;
    updateButtonLabel(user);
    if (user) {
      pullAndMerge(user.uid).then(function () {
        // Push any local changes to Firestore going forward
        if (window.AIFSProgress) {
          window.AIFSProgress.onChange(schedulePush);
        }
      });
    } else {
      setSyncDot('');
    }
  });

  // ── Boot ──────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }
})();
