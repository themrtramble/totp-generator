/**
 * TOTP Generator — ultra-modern client-side app
 * Multi-account vault · themes · QR · PWA hooks
 * Author: tramblebot (MrTramble)
 */

const APP_VERSION = '4.0.0';
const STORAGE_KEY = 'totp-generator:prefs:v2';
const VAULT_KEY = 'totp-generator:vault:v1';
const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const BASE32_RE = /^[A-Z2-7]+=*$/;
const COLOR_OPTIONS = ['#8b7cff', '#22d3ee', '#fb7185', '#34d399', '#fbbf24', '#60a5fa', '#f472b6', '#a78bfa'];

function getNowMs() {
  return Date.now();
}

function stripSpaces(str) {
  return String(str || '').replace(/\s/g, '');
}

function normalizeSecret(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[\s\-_=]/g, '')
    .replace(/[^A-Z2-7]/g, '');
}

function isValidBase32(secret) {
  if (!secret || secret.length < 8) return false;
  return BASE32_RE.test(secret) || /^[A-Z2-7]+$/.test(secret);
}

function truncateTo(str, digits) {
  if (str.length <= digits) return str;
  return str.slice(-digits);
}

function uid() {
  return 'acc_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function parseURLSearch(search) {
  if (!search || search.length < 2) return {};
  return search.substr(1).split('&').reduce(function (q, query) {
    const chunks = query.split('=');
    const key = chunks[0];
    if (!key) return q;
    let value = decodeURIComponent(chunks[1] || '');
    value = isNaN(Number(value)) ? value : Number(value);
    q[key] = value;
    return q;
  }, {});
}

/**
 * Parse otpauth://totp/Label?secret=...&digits=6&period=30&algorithm=SHA1
 */
function parseOtpAuthUri(input) {
  const raw = String(input || '').trim();
  if (!/^otpauth:\/\//i.test(raw)) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== 'otpauth:') return null;

    const params = url.searchParams;
    const secret = params.get('secret');
    if (!secret) return null;

    const result = {
      secret: normalizeSecret(secret),
      issuer: params.get('issuer') || null,
      label: null,
      digits: null,
      period: null,
      algorithm: null,
    };

    const pathLabel = decodeURIComponent((url.pathname || '').replace(/^\//, ''));
    if (pathLabel) {
      result.label = pathLabel;
      if (!result.issuer && pathLabel.includes(':')) {
        result.issuer = pathLabel.split(':')[0];
        result.label = pathLabel.split(':').slice(1).join(':') || pathLabel;
      }
    }

    if (params.has('digits')) {
      const d = Number(params.get('digits'));
      if ([6, 7, 8].includes(d)) result.digits = d;
    }
    if (params.has('period')) {
      const p = Number(params.get('period'));
      if ([15, 30, 60, 90].includes(p)) result.period = p;
    }
    if (params.has('algorithm')) {
      const alg = String(params.get('algorithm')).toUpperCase().replace(/-/g, '');
      if (['SHA1', 'SHA256', 'SHA512'].includes(alg)) {
        result.algorithm = alg;
      }
    }

    return result;
  } catch (e) {
    return null;
  }
}

function loadJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* private mode / quota */
  }
}

function formatCodeGroups(code) {
  if (!code) return '';
  return String(code).replace(/(\d{3})(?=\d)/g, '$1 ');
}

function applyDocumentTheme(theme, accent, density, motion) {
  const root = document.documentElement;
  let resolved = theme;
  if (theme === 'system') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    resolved = prefersDark ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-accent', accent || 'violet');
  root.setAttribute('data-density', density || 'comfortable');
  root.setAttribute('data-motion', motion || 'full');

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', resolved === 'light' ? '#eef2fb' : '#05070f');
  }
}

const app = Vue.createApp({
  data() {
    return {
      secret_key: 'JBSWY3DPEHPK3PXP',
      digits: 6,
      period: 30,
      algorithm: 'SHA1',
      updatingIn: 30,
      progressFraction: 1,
      token: null,
      previousToken: null,
      nextToken: null,
      flipKeys: {},
      clipboardButton: null,
      showSecret: true,
      showAdvanced: false,
      showPrevious: false,
      showVault: true,
      showSettings: false,
      showHelp: false,
      showQr: false,
      copied: false,
      toastVisible: false,
      toastMessage: '',
      toastType: 'success',
      secretError: null,
      accountLabel: null,
      issuer: null,
      accountColor: COLOR_OPTIONS[0],
      clockSkewHint: null,
      timeOffset: 0,
      digitOptions: [6, 7, 8],
      periodOptions: [15, 30, 60, 90],
      algorithmOptions: [
        { value: 'SHA1', label: 'SHA-1' },
        { value: 'SHA256', label: 'SHA-256' },
        { value: 'SHA512', label: 'SHA-512' },
      ],
      colorOptions: COLOR_OPTIONS,
      accentOptions: ['violet', 'cyan', 'rose', 'emerald', 'amber'],
      theme: 'dark',
      accent: 'violet',
      density: 'comfortable',
      motion: 'full',
      autoCopyOnRefresh: false,
      hapticFeedback: true,
      vault: [],
      vaultQuery: '',
      activeAccountId: null,
      copyHistory: [],
      localClockLabel: '',
      _copyResetTimer: null,
      _toastTimer: null,
      _flipClearTimer: null,
      _rafId: null,
      _clockTimer: null,
      _lastToken: null,
      _lastTickSec: null,
      _prefsLoaded: false,
      _suppressSave: false,
      _loopRunning: false,
      _qrInstance: null,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isTabVisible: typeof document !== 'undefined'
        ? document.visibilityState !== 'hidden'
        : true,
    };
  },

  mounted() {
    this._suppressSave = true;
    this.restorePrefs();
    this.restoreVault();
    this.getKeyFromUrl();
    this.getQueryParameters();
    this.applyThemeAttrs();
    this._suppressSave = false;
    this._prefsLoaded = true;

    this.tick();
    this.startSmoothLoop();
    this.startClockLabel();
    this.bindLifecycleListeners();
    this.bindKeyboardShortcuts();
    this.bindSystemThemeListener();
    this.registerServiceWorker();
    this.bindDropImport();

    this.clipboardButton = new ClipboardJS('#clipboard-button');
    this.clipboardButton.on('success', (e) => {
      this.showCopied('Code copied to clipboard');
      this.pushCopyHistory(this.token);
      this.maybeVibrate();
      e.clearSelection();
    });
  },

  unmounted() {
    this.stopSmoothLoop();
    this.unbindLifecycleListeners();
    this.unbindKeyboardShortcuts();
    this.unbindDropImport();
    clearTimeout(this._copyResetTimer);
    clearTimeout(this._toastTimer);
    clearTimeout(this._flipClearTimer);
    clearInterval(this._clockTimer);
    if (this.clipboardButton) {
      this.clipboardButton.destroy();
    }
  },

  computed: {
    circumference() {
      return RING_CIRCUMFERENCE;
    },

    ringOffset() {
      return RING_CIRCUMFERENCE * (1 - this.progressFraction);
    },

    progressPercent() {
      return Math.max(0, Math.min(100, this.progressFraction * 100));
    },

    isUrgent() {
      return this.updatingIn <= 5 && !!this.token;
    },

    remainingLabel() {
      if (!this.token) return '';
      return this.updatingIn + 's remaining';
    },

    tokenDigits() {
      if (!this.token) {
        const count = Number(this.digits) || 6;
        return Array.from({ length: count }, () => ({ char: '·', flip: false }));
      }
      return String(this.token).split('').map((char, i) => ({
        char,
        flip: !!this.flipKeys[i],
      }));
    },

    previousDigits() {
      if (!this.previousToken) return [];
      return String(this.previousToken).split('');
    },

    nextDigits() {
      if (!this.nextToken) return [];
      return String(this.nextToken).split('');
    },

    normalizedSecret() {
      return normalizeSecret(this.secret_key);
    },

    secretStatus() {
      const secret = this.normalizedSecret;
      if (!secret) return { ok: false, message: 'Enter a secret key' };
      if (secret.length < 8) return { ok: false, message: 'Secret too short for Base32' };
      if (!isValidBase32(secret)) return { ok: false, message: 'Invalid Base32 characters' };
      return { ok: true, message: null };
    },

    displayLabel() {
      if (this.issuer && this.accountLabel) return this.issuer + ' · ' + this.accountLabel;
      return this.accountLabel || this.issuer || null;
    },

    filteredVault() {
      const q = String(this.vaultQuery || '').trim().toLowerCase();
      let list = this.vault.slice();
      list.sort((a, b) => {
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
        return String(a.label || '').localeCompare(String(b.label || ''));
      });
      if (!q) return list;
      return list.filter((item) => {
        const hay = [item.label, item.issuer, item.algorithm].join(' ').toLowerCase();
        return hay.includes(q);
      });
    },

    activeAccountPinned() {
      const acc = this.vault.find((v) => v.id === this.activeAccountId);
      return !!(acc && acc.pinned);
    },

    totp() {
      try {
        const secret = this.normalizedSecret;
        if (!this.secretStatus.ok) return null;
        return new OTPAuth.TOTP({
          algorithm: this.algorithm,
          digits: Number(this.digits) || 6,
          period: Number(this.period) || 30,
          secret: OTPAuth.Secret.fromBase32(secret),
        });
      } catch (e) {
        return null;
      }
    },

    shareUrl() {
      const secret = this.normalizedSecret;
      if (!secret || !this.secretStatus.ok) return '';
      const base = window.location.origin + window.location.pathname;
      const q = new URLSearchParams();
      if (Number(this.digits) !== 6) q.set('digits', String(this.digits));
      if (Number(this.period) !== 30) q.set('period', String(this.period));
      if (this.algorithm !== 'SHA1') q.set('algorithm', this.algorithm);
      const qs = q.toString();
      return base + (qs ? '?' + qs : '') + '#/' + secret;
    },

    otpAuthUri() {
      const secret = this.normalizedSecret;
      if (!secret || !this.secretStatus.ok) return '';

      const labelParts = [];
      if (this.issuer) labelParts.push(this.issuer);
      labelParts.push(this.accountLabel || 'TOTP Generator');
      const label = encodeURIComponent(labelParts.join(':'));

      const params = new URLSearchParams();
      params.set('secret', secret);
      params.set('issuer', this.issuer || 'MrTramble');
      params.set('algorithm', this.algorithm);
      params.set('digits', String(Number(this.digits) || 6));
      params.set('period', String(Number(this.period) || 30));
      return 'otpauth://totp/' + label + '?' + params.toString();
    },
  },

  watch: {
    secret_key() {
      this.tick();
      this.persistPrefs();
    },
    digits() {
      this.tick();
      this.persistPrefs();
      this.syncActiveAccountFields();
    },
    period() {
      this.tick();
      this.persistPrefs();
      this.syncActiveAccountFields();
    },
    algorithm() {
      this.tick();
      this.persistPrefs();
      this.syncActiveAccountFields();
    },
    timeOffset() {
      this.tick();
    },
    showQr(val) {
      if (val) {
        this.$nextTick(() => this.renderQr());
      } else {
        this.clearQr();
      }
    },
  },

  methods: {
    applyThemeAttrs() {
      applyDocumentTheme(this.theme, this.accent, this.density, this.motion);
    },

    setTheme(theme) {
      this.theme = theme;
      this.applyThemeAttrs();
      this.persistPrefs();
    },

    cycleTheme() {
      const order = ['dark', 'light', 'system'];
      const idx = order.indexOf(this.theme);
      this.setTheme(order[(idx + 1) % order.length]);
      this.showToast('Theme: ' + this.theme, 'info');
    },

    setAccent(accent) {
      this.accent = accent;
      this.applyThemeAttrs();
      this.persistPrefs();
    },

    setDensity(density) {
      this.density = density;
      this.applyThemeAttrs();
      this.persistPrefs();
    },

    setMotion(motion) {
      this.motion = motion;
      this.applyThemeAttrs();
      this.persistPrefs();
    },

    restorePrefs() {
      const prefs = loadJson(STORAGE_KEY);
      if (!prefs || typeof prefs !== 'object') {
        // migrate v1
        const legacy = loadJson('totp-generator:prefs:v1');
        if (legacy && typeof legacy === 'object') {
          Object.assign(prefs || {}, legacy);
        } else {
          return;
        }
      }

      const p = prefs || loadJson('totp-generator:prefs:v1') || {};
      if (typeof p.secret_key === 'string' && p.secret_key.length) this.secret_key = p.secret_key;
      if ([6, 7, 8].includes(Number(p.digits))) this.digits = Number(p.digits);
      if ([15, 30, 60, 90].includes(Number(p.period))) this.period = Number(p.period);
      if (['SHA1', 'SHA256', 'SHA512'].includes(p.algorithm)) this.algorithm = p.algorithm;
      if (typeof p.showAdvanced === 'boolean') this.showAdvanced = p.showAdvanced;
      if (typeof p.showSecret === 'boolean') this.showSecret = p.showSecret;
      if (typeof p.showVault === 'boolean') this.showVault = p.showVault;
      if (typeof p.accountLabel === 'string') this.accountLabel = p.accountLabel;
      if (typeof p.issuer === 'string') this.issuer = p.issuer;
      if (typeof p.accountColor === 'string') this.accountColor = p.accountColor;
      if (typeof p.timeOffset === 'number' && p.timeOffset >= -60 && p.timeOffset <= 60) {
        this.timeOffset = p.timeOffset;
      }
      if (['dark', 'light', 'system'].includes(p.theme)) this.theme = p.theme;
      if (this.accentOptions.includes(p.accent)) this.accent = p.accent;
      if (['comfortable', 'compact'].includes(p.density)) this.density = p.density;
      if (['full', 'reduce'].includes(p.motion)) this.motion = p.motion;
      if (typeof p.autoCopyOnRefresh === 'boolean') this.autoCopyOnRefresh = p.autoCopyOnRefresh;
      if (typeof p.hapticFeedback === 'boolean') this.hapticFeedback = p.hapticFeedback;
      if (typeof p.activeAccountId === 'string') this.activeAccountId = p.activeAccountId;
      if (Array.isArray(p.copyHistory)) this.copyHistory = p.copyHistory.slice(0, 12);
    },

    persistPrefs() {
      if (this._suppressSave || !this._prefsLoaded) return;
      saveJson(STORAGE_KEY, {
        secret_key: this.secret_key,
        digits: this.digits,
        period: this.period,
        algorithm: this.algorithm,
        showAdvanced: this.showAdvanced,
        showSecret: this.showSecret,
        showVault: this.showVault,
        accountLabel: this.accountLabel,
        issuer: this.issuer,
        accountColor: this.accountColor,
        timeOffset: this.timeOffset,
        theme: this.theme,
        accent: this.accent,
        density: this.density,
        motion: this.motion,
        autoCopyOnRefresh: this.autoCopyOnRefresh,
        hapticFeedback: this.hapticFeedback,
        activeAccountId: this.activeAccountId,
        copyHistory: this.copyHistory.slice(0, 12),
        savedAt: Date.now(),
      });
    },

    restoreVault() {
      const data = loadJson(VAULT_KEY);
      if (Array.isArray(data)) {
        this.vault = data.filter((item) => item && item.id && item.secret);
      }
    },

    persistVault() {
      saveJson(VAULT_KEY, this.vault);
    },

    bindSystemThemeListener() {
      if (!window.matchMedia) return;
      this._mq = window.matchMedia('(prefers-color-scheme: dark)');
      this._onMq = () => {
        if (this.theme === 'system') this.applyThemeAttrs();
      };
      if (this._mq.addEventListener) this._mq.addEventListener('change', this._onMq);
      else if (this._mq.addListener) this._mq.addListener(this._onMq);
    },

    registerServiceWorker() {
      if (!('serviceWorker' in navigator)) return;
      // Only register when served over http(s)
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      navigator.serviceWorker.register('./sw.js').catch(() => {
        /* ignore SW failures */
      });
    },

    bindLifecycleListeners() {
      this._onVisibility = () => {
        this.isTabVisible = document.visibilityState !== 'hidden';
        if (this.isTabVisible) {
          this.tick();
          this.startSmoothLoop();
        } else {
          this.stopSmoothLoop();
        }
      };
      this._onOnline = () => { this.isOnline = true; };
      this._onOffline = () => { this.isOnline = false; };
      this._onHashChange = () => {
        this.getKeyFromUrl();
        this.tick();
      };

      document.addEventListener('visibilitychange', this._onVisibility);
      window.addEventListener('online', this._onOnline);
      window.addEventListener('offline', this._onOffline);
      window.addEventListener('hashchange', this._onHashChange);
    },

    unbindDropImport() {
      if (this._onDragOver) window.removeEventListener('dragover', this._onDragOver);
      if (this._onDrop) window.removeEventListener('drop', this._onDrop);
    },

    unbindLifecycleListeners() {
      if (this._onVisibility) document.removeEventListener('visibilitychange', this._onVisibility);
      if (this._onOnline) window.removeEventListener('online', this._onOnline);
      if (this._onOffline) window.removeEventListener('offline', this._onOffline);
      if (this._onHashChange) window.removeEventListener('hashchange', this._onHashChange);
    },

    isTypingTarget(el) {
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    },

    bindKeyboardShortcuts() {
      this._onKeydown = (event) => {
        const typing = this.isTypingTarget(event.target);
        const mod = event.ctrlKey || event.metaKey;

        if (event.key === 'Escape') {
          if (this.showSettings || this.showHelp || this.showQr) {
            this.showSettings = false;
            this.showHelp = false;
            this.showQr = false;
            event.preventDefault();
            return;
          }
          const input = document.getElementById('secret');
          if (input && document.activeElement === input) input.blur();
          return;
        }

        if (mod && event.key === 'Enter') {
          event.preventDefault();
          this.copyToken();
          return;
        }

        if (mod && event.shiftKey && (event.key === 'C' || event.key === 'c')) {
          event.preventDefault();
          this.copyToken();
          return;
        }

        if (typing) return;

        const key = event.key;
        if (key === 'c' || key === 'C') {
          event.preventDefault();
          this.copyToken();
        } else if (key === 's' || key === 'S') {
          event.preventDefault();
          this.copyShareLink();
        } else if (key === 'q' || key === 'Q') {
          event.preventDefault();
          this.openQrModal();
        } else if (key === 'p' || key === 'P') {
          event.preventDefault();
          if (this.previousToken || this.nextToken) this.showPrevious = !this.showPrevious;
        } else if (key === 'v' || key === 'V') {
          event.preventDefault();
          this.saveCurrentToVault();
        } else if (key === 'b' || key === 'B') {
          event.preventDefault();
          this.showVault = !this.showVault;
          this.persistPrefs();
        } else if (key === ',') {
          event.preventDefault();
          this.showSettings = true;
        } else if (key === '?' || (event.shiftKey && key === '/')) {
          event.preventDefault();
          this.showHelp = true;
        } else if (key === '/') {
          event.preventDefault();
          const input = document.getElementById('secret');
          if (input) input.focus();
        } else if (key >= '1' && key <= '9') {
          const idx = Number(key) - 1;
          const item = this.filteredVault[idx];
          if (item) {
            event.preventDefault();
            this.loadAccount(item.id);
          }
        }
      };
      window.addEventListener('keydown', this._onKeydown);
    },

    unbindKeyboardShortcuts() {
      if (this._onKeydown) window.removeEventListener('keydown', this._onKeydown);
    },

    bindDropImport() {
      this._onDragOver = (e) => {
        if (!e.dataTransfer) return;
        e.preventDefault();
      };
      this._onDrop = (e) => {
        if (!e.dataTransfer) return;
        e.preventDefault();
        const text = e.dataTransfer.getData('text') || e.dataTransfer.getData('text/plain');
        if (!text) return;
        const parsed = parseOtpAuthUri(text);
        if (parsed) {
          this.applyOtpAuth(parsed);
          this.showToast('Dropped otpauth URI imported', 'success');
          return;
        }
        const cleaned = normalizeSecret(text);
        if (cleaned && cleaned.length >= 8 && isValidBase32(cleaned)) {
          this.secret_key = cleaned;
          this.showToast('Dropped secret applied', 'success');
        }
      };
      window.addEventListener('dragover', this._onDragOver);
      window.addEventListener('drop', this._onDrop);
    },

    startClockLabel() {
      const update = () => {
        try {
          this.localClockLabel = new Date(getNowMs() + this.timeOffset * 1000).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          });
        } catch (e) {
          this.localClockLabel = '';
        }
      };
      update();
      this._clockTimer = setInterval(update, 1000);
    },

    startSmoothLoop() {
      if (this._loopRunning) return;
      this._loopRunning = true;

      const loop = () => {
        if (!this._loopRunning) return;
        this.updateProgress();
        const sec = Math.floor((getNowMs() + this.timeOffset * 1000) / 1000);
        if (sec !== this._lastTickSec) {
          this._lastTickSec = sec;
          this.tick();
        }
        this._rafId = requestAnimationFrame(loop);
      };
      this._rafId = requestAnimationFrame(loop);
    },

    stopSmoothLoop() {
      this._loopRunning = false;
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
    },

    effectiveNowMs() {
      return getNowMs() + (Number(this.timeOffset) || 0) * 1000;
    },

    updateProgress() {
      const period = Math.max(Number(this.period) || 30, 1);
      const nowMs = this.effectiveNowMs();
      const elapsedInPeriod = (nowMs / 1000) % period;
      const remaining = period - elapsedInPeriod;

      this.progressFraction = Math.max(0, Math.min(1, remaining / period));
      this.updatingIn = Math.max(0, Math.ceil(remaining));
      if (this.updatingIn === 0) this.updatingIn = period;

      if (this.updatingIn <= 2) {
        this.clockSkewHint = 'Rolling soon — use previous code if login rejects this one';
      } else {
        this.clockSkewHint = null;
      }
    },

    generateAt(timestampSec) {
      if (!this.totp) return null;
      try {
        const digits = Number(this.digits) || 6;
        const code = this.totp.generate({ timestamp: timestampSec * 1000 });
        return truncateTo(code, digits);
      } catch (e) {
        return null;
      }
    },

    tick() {
      this.updateProgress();

      if (!this.totp) {
        this.token = null;
        this.previousToken = null;
        this.nextToken = null;
        this._lastToken = null;
        this.secretError = this.secretStatus.message || 'Invalid Base32 secret key';
        return;
      }

      this.secretError = null;

      try {
        const nowSec = Math.floor(this.effectiveNowMs() / 1000);
        const period = Math.max(Number(this.period) || 30, 1);
        const digits = Number(this.digits) || 6;
        const current = truncateTo(this.totp.generate({ timestamp: this.effectiveNowMs() }), digits);
        const prev = this.generateAt(nowSec - period);
        const upcoming = this.generateAt(nowSec + period);

        if (this._lastToken !== null && this._lastToken !== current) {
          this.triggerDigitFlips(current, this._lastToken);
          if (this.autoCopyOnRefresh && current) {
            this.copyText(current, 'New code auto-copied');
            this.pushCopyHistory(current);
          }
        }

        this.token = current;
        this.previousToken = prev;
        this.nextToken = upcoming;
        this._lastToken = current;
      } catch (e) {
        this.token = null;
        this.previousToken = null;
        this.nextToken = null;
        this._lastToken = null;
        this.secretError = 'Could not generate token';
      }
    },

    triggerDigitFlips(next, prev) {
      const flips = {};
      const nextChars = String(next).split('');
      const prevChars = String(prev).split('');
      nextChars.forEach((ch, i) => {
        if (prevChars[i] !== ch) flips[i] = true;
      });
      this.flipKeys = flips;
      clearTimeout(this._flipClearTimer);
      this._flipClearTimer = setTimeout(() => { this.flipKeys = {}; }, 480);
    },

    onSecretInput(event) {
      const value = event && event.target ? event.target.value : this.secret_key;
      const parsed = parseOtpAuthUri(value);
      if (parsed) {
        this.applyOtpAuth(parsed);
        return;
      }
      this.secret_key = value;
    },

    onSecretPaste(event) {
      const text = (event.clipboardData || window.clipboardData).getData('text');
      if (!text) return;

      const parsed = parseOtpAuthUri(text);
      if (parsed) {
        event.preventDefault();
        this.applyOtpAuth(parsed);
        this.showToast('Imported otpauth URI settings', 'success');
        return;
      }

      const cleaned = normalizeSecret(text);
      if (cleaned && cleaned.length >= 8 && isValidBase32(cleaned)) {
        event.preventDefault();
        this.secret_key = cleaned;
        this.showToast('Secret cleaned & applied', 'success');
      }
    },

    applyOtpAuth(parsed) {
      this._suppressSave = true;
      this.secret_key = parsed.secret;
      if (parsed.digits) this.digits = parsed.digits;
      if (parsed.period) this.period = parsed.period;
      if (parsed.algorithm) this.algorithm = parsed.algorithm;
      if (parsed.label) this.accountLabel = parsed.label;
      if (parsed.issuer) this.issuer = parsed.issuer;
      this.showAdvanced = true;
      this._suppressSave = false;
      this.tick();
      this.persistPrefs();
    },

    onAccountMetaChange() {
      this.persistPrefs();
      this.syncActiveAccountFields();
    },

    normalizeSecretField() {
      const cleaned = this.normalizedSecret;
      if (cleaned !== this.secret_key) this.secret_key = cleaned;
      this.tick();
    },

    maybeVibrate() {
      if (!this.hapticFeedback) return;
      if (navigator.vibrate) {
        try { navigator.vibrate(12); } catch (e) { /* ignore */ }
      }
    },

    copyText(text, message) {
      if (!text) return;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
          this.showCopied(message || 'Copied');
          this.maybeVibrate();
        }).catch(() => {
          this.fallbackCopy(text, message);
        });
      } else {
        this.fallbackCopy(text, message);
      }
    },

    copyToken() {
      if (!this.token) return;
      this.copyText(this.token, 'Code copied to clipboard');
      this.pushCopyHistory(this.token);
    },

    copyPrevious() {
      if (!this.previousToken) return;
      this.copyText(this.previousToken, 'Previous code copied');
      this.pushCopyHistory(this.previousToken);
    },

    copyNext() {
      if (!this.nextToken) return;
      this.copyText(this.nextToken, 'Next period code copied');
      this.pushCopyHistory(this.nextToken);
    },

    copyShareLink() {
      const url = this.shareUrl;
      if (!url) {
        this.showToast('Enter a valid secret first', 'error');
        return;
      }
      this.copyText(url, 'Share link copied (uses # fragment)');
    },

    copyOtpAuthUri() {
      const uri = this.otpAuthUri;
      if (!uri) {
        this.showToast('Enter a valid secret first', 'error');
        return;
      }
      this.copyText(uri, 'otpauth URI copied');
    },

    pushCopyHistory(code) {
      if (!code) return;
      const entry = {
        code: String(code),
        label: this.displayLabel || 'Code',
        at: Date.now(),
        atLabel: new Date().toLocaleTimeString(),
      };
      this.copyHistory = [entry].concat(this.copyHistory.filter((h) => h.code !== entry.code)).slice(0, 12);
      this.persistPrefs();
    },

    recopyHistory(h) {
      if (!h || !h.code) return;
      this.copyText(h.code, 'History code copied');
    },

    clearCopyHistory() {
      this.copyHistory = [];
      this.persistPrefs();
      this.showToast('Copy history cleared', 'info');
    },

    fallbackCopy(text, message) {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand('copy');
        this.showCopied(message || 'Copied');
        this.maybeVibrate();
      } catch (e) { /* ignore */ }
      document.body.removeChild(el);
    },

    showCopied(message) {
      this.copied = true;
      this.showToast(message || 'Code copied to clipboard', 'success');
      clearTimeout(this._copyResetTimer);
      this._copyResetTimer = setTimeout(() => { this.copied = false; }, 1800);
    },

    showToast(message, type) {
      this.toastMessage = message || '';
      this.toastType = type || 'success';
      this.toastVisible = true;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { this.toastVisible = false; }, 2300);
    },

    openQrModal() {
      if (!this.otpAuthUri) {
        this.showToast('Enter a valid secret first', 'error');
        return;
      }
      this.showQr = true;
    },

    clearQr() {
      const mount = this.$refs.qrMount;
      if (mount) mount.innerHTML = '';
      this._qrInstance = null;
    },

    renderQr() {
      const mount = this.$refs.qrMount;
      if (!mount || !this.otpAuthUri) return;
      mount.innerHTML = '';
      if (typeof QRCode === 'undefined') {
        mount.textContent = 'QR library unavailable';
        return;
      }
      try {
        this._qrInstance = new QRCode(mount, {
          text: this.otpAuthUri,
          width: 200,
          height: 200,
          colorDark: '#0f172a',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M,
        });
      } catch (e) {
        mount.textContent = 'Could not render QR';
      }
    },

    saveCurrentToVault() {
      if (!this.secretStatus.ok) {
        this.showToast('Valid secret required to save', 'error');
        return;
      }

      const payload = {
        secret: this.normalizedSecret,
        label: this.accountLabel || 'Untitled',
        issuer: this.issuer || '',
        digits: Number(this.digits) || 6,
        period: Number(this.period) || 30,
        algorithm: this.algorithm,
        color: this.accountColor || COLOR_OPTIONS[0],
        pinned: false,
        updatedAt: Date.now(),
      };

      if (this.activeAccountId) {
        const idx = this.vault.findIndex((v) => v.id === this.activeAccountId);
        if (idx >= 0) {
          payload.pinned = !!this.vault[idx].pinned;
          payload.id = this.activeAccountId;
          this.vault.splice(idx, 1, Object.assign({}, this.vault[idx], payload));
          this.persistVault();
          this.showToast('Account updated in vault', 'success');
          return;
        }
      }

      // Upsert by secret
      const existing = this.vault.findIndex((v) => v.secret === payload.secret);
      if (existing >= 0) {
        payload.id = this.vault[existing].id;
        payload.pinned = !!this.vault[existing].pinned;
        this.vault.splice(existing, 1, Object.assign({}, this.vault[existing], payload));
        this.activeAccountId = payload.id;
      } else {
        payload.id = uid();
        this.vault.push(payload);
        this.activeAccountId = payload.id;
      }
      this.persistVault();
      this.persistPrefs();
      this.showToast(existing >= 0 ? 'Updated existing vault account' : 'Saved to vault', 'success');
    },

    loadAccount(id) {
      const item = this.vault.find((v) => v.id === id);
      if (!item) return;
      this._suppressSave = true;
      this.activeAccountId = item.id;
      this.secret_key = item.secret;
      this.accountLabel = item.label || null;
      this.issuer = item.issuer || null;
      this.digits = item.digits || 6;
      this.period = item.period || 30;
      this.algorithm = item.algorithm || 'SHA1';
      this.accountColor = item.color || COLOR_OPTIONS[0];
      this._suppressSave = false;
      this.tick();
      this.persistPrefs();
      this.showToast('Loaded ' + (item.label || 'account'), 'info');
    },

    syncActiveAccountFields() {
      if (!this.activeAccountId || this._suppressSave) return;
      const idx = this.vault.findIndex((v) => v.id === this.activeAccountId);
      if (idx < 0) return;
      const item = this.vault[idx];
      if (item.secret !== this.normalizedSecret) return;
      this.vault.splice(idx, 1, Object.assign({}, item, {
        label: this.accountLabel || item.label,
        issuer: this.issuer || '',
        digits: this.digits,
        period: this.period,
        algorithm: this.algorithm,
        color: this.accountColor,
        updatedAt: Date.now(),
      }));
      this.persistVault();
    },

    togglePinActive() {
      const idx = this.vault.findIndex((v) => v.id === this.activeAccountId);
      if (idx < 0) return;
      const item = this.vault[idx];
      this.vault.splice(idx, 1, Object.assign({}, item, { pinned: !item.pinned }));
      this.persistVault();
      this.showToast(item.pinned ? 'Unpinned' : 'Pinned', 'info');
    },

    deleteActiveAccount() {
      if (!this.activeAccountId) return;
      if (!window.confirm('Remove this account from the local vault?')) return;
      this.vault = this.vault.filter((v) => v.id !== this.activeAccountId);
      this.activeAccountId = null;
      this.persistVault();
      this.persistPrefs();
      this.showToast('Account removed from vault', 'info');
    },

    exportVault() {
      if (!this.vault.length) {
        this.showToast('Vault is empty — nothing to export', 'error');
        return;
      }
      const blob = new Blob([JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        vault: this.vault,
      }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'totp-vault-export.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast('Vault exported (keep this file private)', 'info');
    },

    triggerImport() {
      const input = this.$refs.importFile;
      if (input) input.click();
    },

    importVaultFile(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result || ''));
          const list = Array.isArray(data) ? data : (data && data.vault);
          if (!Array.isArray(list)) throw new Error('Invalid vault file');
          let added = 0;
          list.forEach((raw) => {
            if (!raw || !raw.secret) return;
            const secret = normalizeSecret(raw.secret);
            if (!isValidBase32(secret)) return;
            const existing = this.vault.find((v) => v.secret === secret);
            if (existing) {
              Object.assign(existing, {
                label: raw.label || existing.label,
                issuer: raw.issuer || existing.issuer,
                digits: raw.digits || existing.digits,
                period: raw.period || existing.period,
                algorithm: raw.algorithm || existing.algorithm,
                color: raw.color || existing.color,
                pinned: !!raw.pinned || !!existing.pinned,
                updatedAt: Date.now(),
              });
            } else {
              this.vault.push({
                id: raw.id || uid(),
                secret,
                label: raw.label || 'Imported',
                issuer: raw.issuer || '',
                digits: [6, 7, 8].includes(Number(raw.digits)) ? Number(raw.digits) : 6,
                period: [15, 30, 60, 90].includes(Number(raw.period)) ? Number(raw.period) : 30,
                algorithm: ['SHA1', 'SHA256', 'SHA512'].includes(raw.algorithm) ? raw.algorithm : 'SHA1',
                color: raw.color || COLOR_OPTIONS[added % COLOR_OPTIONS.length],
                pinned: !!raw.pinned,
                updatedAt: Date.now(),
              });
              added += 1;
            }
          });
          this.persistVault();
          this.showToast('Vault imported (' + added + ' new)', 'success');
        } catch (e) {
          this.showToast('Could not import vault file', 'error');
        }
        event.target.value = '';
      };
      reader.readAsText(file);
    },

    wipeAllLocalData() {
      if (!window.confirm('Wipe all local prefs, vault, and history on this device?')) return;
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(VAULT_KEY);
        localStorage.removeItem('totp-generator:prefs:v1');
      } catch (e) { /* ignore */ }
      this.vault = [];
      this.copyHistory = [];
      this.activeAccountId = null;
      this.secret_key = '';
      this.accountLabel = null;
      this.issuer = null;
      this.showToast('Local data wiped', 'info');
      this.tick();
    },

    getKeyFromUrl() {
      const key = document.location.hash.replace(/[#\/]+/, '');
      if (key.length > 0) {
        const parsed = parseOtpAuthUri(decodeURIComponent(key));
        if (parsed) this.applyOtpAuth(parsed);
        else this.secret_key = normalizeSecret(decodeURIComponent(key)) || key;
      }
    },

    getQueryParameters() {
      const queryParams = parseURLSearch(window.location.search);
      if (queryParams.key) {
        const raw = String(queryParams.key);
        const parsed = parseOtpAuthUri(raw);
        if (parsed) this.applyOtpAuth(parsed);
        else this.secret_key = normalizeSecret(raw) || raw;
      }
      if (queryParams.digits) this.digits = Number(queryParams.digits);
      if (queryParams.period) this.period = Number(queryParams.period);
      if (queryParams.algorithm) {
        const alg = String(queryParams.algorithm).toUpperCase().replace(/-/g, '');
        if (['SHA1', 'SHA256', 'SHA512'].includes(alg)) this.algorithm = alg;
      }
    },

    clearSecret() {
      this.secret_key = '';
      this.accountLabel = null;
      this.issuer = null;
      this.activeAccountId = null;
      this.tick();
      this.persistPrefs();
    },

    formatCodeGroups,
  },
});

app.mount('#app');





