/**
 * TOTP Generator — client-side only
 * Author: tramblebot (MrTramble)
 */

const STORAGE_KEY = 'totp-generator:prefs:v1';
const RING_RADIUS = 50;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const BASE32_RE = /^[A-Z2-7]+=*$/;

function getCurrentSeconds() {
  return Math.round(Date.now() / 1000);
}

function getNowMs() {
  return Date.now();
}

function stripSpaces(str) {
  return String(str || '').replace(/\s/g, '');
}

/** Uppercase, strip spaces/dashes, keep Base32 alphabet only. */
function normalizeSecret(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[\s\-_=]/g, '')
    .replace(/[^A-Z2-7]/g, '');
}

function isValidBase32(secret) {
  if (!secret || secret.length < 8) return false;
  // Pad mentally: length must be usable by otpauth; require pure alphabet
  return BASE32_RE.test(secret) || /^[A-Z2-7]+$/.test(secret);
}

function truncateTo(str, digits) {
  if (str.length <= digits) {
    return str;
  }
  return str.slice(-digits);
}

function parseURLSearch(search) {
  if (!search || search.length < 2) {
    return {};
  }

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
 * Returns null if not an otpauth URI.
 */
function parseOtpAuthUri(input) {
  const raw = String(input || '').trim();
  if (!/^otpauth:\/\//i.test(raw)) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== 'otpauth:') return null;

    const type = (url.hostname || url.pathname.replace(/^\//, '').split('/')[0] || '').toLowerCase();
    if (type && type !== 'totp' && type !== 'hotp') {
      // pathname form: otpauth://totp/Issuer:account
    }

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

    // Label is usually path after host, e.g. /Issuer:account
    const pathLabel = decodeURIComponent((url.pathname || '').replace(/^\//, ''));
    if (pathLabel) {
      result.label = pathLabel;
      if (!result.issuer && pathLabel.includes(':')) {
        result.issuer = pathLabel.split(':')[0];
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

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    /* private mode / quota */
  }
}

function formatCodeGroups(code) {
  if (!code) return '';
  return String(code).replace(/(\d{3})(?=\d)/g, '$1 ');
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
      copied: false,
      toastVisible: false,
      toastMessage: '',
      secretError: null,
      accountLabel: null,
      clockSkewHint: null,
      digitOptions: [6, 7, 8],
      periodOptions: [15, 30, 60, 90],
      algorithmOptions: [
        { value: 'SHA1', label: 'SHA-1' },
        { value: 'SHA256', label: 'SHA-256' },
        { value: 'SHA512', label: 'SHA-512' },
      ],
      _copyResetTimer: null,
      _toastTimer: null,
      _flipClearTimer: null,
      _rafId: null,
      _lastToken: null,
      _lastTickSec: null,
      _prefsLoaded: false,
      _suppressSave: false,
      _loopRunning: false,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isTabVisible: typeof document !== 'undefined'
        ? document.visibilityState !== 'hidden'
        : true,
    };
  },

  mounted() {
    this._suppressSave = true;
    this.restorePrefs();
    this.getKeyFromUrl();
    this.getQueryParameters();
    this._suppressSave = false;
    this._prefsLoaded = true;

    this.tick();
    this.startSmoothLoop();
    this.bindLifecycleListeners();
    this.bindKeyboardShortcuts();

    this.clipboardButton = new ClipboardJS('#clipboard-button');
    this.clipboardButton.on('success', (e) => {
      this.showCopied('Code copied to clipboard');
      e.clearSelection();
    });
  },

  unmounted() {
    this.stopSmoothLoop();
    this.unbindLifecycleListeners();
    this.unbindKeyboardShortcuts();
    clearTimeout(this._copyResetTimer);
    clearTimeout(this._toastTimer);
    clearTimeout(this._flipClearTimer);
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
      // Prefer fragment so secret is not sent to servers / logs
      return base + (qs ? '?' + qs : '') + '#/' + secret;
    },

    /** Standard otpauth:// URI for authenticator import / backup. */
    otpAuthUri() {
      const secret = this.normalizedSecret;
      if (!secret || !this.secretStatus.ok) return '';

      const label = encodeURIComponent(this.accountLabel || 'TOTP Generator');
      const params = new URLSearchParams();
      params.set('secret', secret);
      params.set('issuer', 'MrTramble');
      params.set('algorithm', this.algorithm);
      params.set('digits', String(Number(this.digits) || 6));
      params.set('period', String(Number(this.period) || 30));
      return 'otpauth://totp/' + label + '?' + params.toString();
    },

    localClockLabel() {
      try {
        return new Date().toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
      } catch (e) {
        return '';
      }
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
    },
    period() {
      this.tick();
      this.persistPrefs();
    },
    algorithm() {
      this.tick();
      this.persistPrefs();
    },
  },

  methods: {
    restorePrefs() {
      const prefs = loadPrefs();
      if (!prefs || typeof prefs !== 'object') return;

      if (typeof prefs.secret_key === 'string' && prefs.secret_key.length) {
        this.secret_key = prefs.secret_key;
      }
      if ([6, 7, 8].includes(Number(prefs.digits))) {
        this.digits = Number(prefs.digits);
      }
      if ([15, 30, 60, 90].includes(Number(prefs.period))) {
        this.period = Number(prefs.period);
      }
      if (['SHA1', 'SHA256', 'SHA512'].includes(prefs.algorithm)) {
        this.algorithm = prefs.algorithm;
      }
      if (typeof prefs.showAdvanced === 'boolean') {
        this.showAdvanced = prefs.showAdvanced;
      }
      if (typeof prefs.showSecret === 'boolean') {
        this.showSecret = prefs.showSecret;
      }
    },

    persistPrefs() {
      if (this._suppressSave || !this._prefsLoaded) return;
      savePrefs({
        secret_key: this.secret_key,
        digits: this.digits,
        period: this.period,
        algorithm: this.algorithm,
        showAdvanced: this.showAdvanced,
        showSecret: this.showSecret,
        savedAt: Date.now(),
      });
    },

    bindLifecycleListeners() {
      this._onVisibility = () => {
        this.isTabVisible = document.visibilityState !== 'hidden';
        if (this.isTabVisible) {
          // Catch up immediately when user returns to the tab
          this.tick();
          this.startSmoothLoop();
        } else {
          this.stopSmoothLoop();
        }
      };
      this._onOnline = () => {
        this.isOnline = true;
      };
      this._onOffline = () => {
        this.isOnline = false;
      };
      this._onHashChange = () => {
        this.getKeyFromUrl();
        this.tick();
      };

      document.addEventListener('visibilitychange', this._onVisibility);
      window.addEventListener('online', this._onOnline);
      window.addEventListener('offline', this._onOffline);
      window.addEventListener('hashchange', this._onHashChange);
    },

    unbindLifecycleListeners() {
      if (this._onVisibility) {
        document.removeEventListener('visibilitychange', this._onVisibility);
      }
      if (this._onOnline) {
        window.removeEventListener('online', this._onOnline);
      }
      if (this._onOffline) {
        window.removeEventListener('offline', this._onOffline);
      }
      if (this._onHashChange) {
        window.removeEventListener('hashchange', this._onHashChange);
      }
    },

    isTypingTarget(el) {
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    },

    bindKeyboardShortcuts() {
      this._onKeydown = (event) => {
        // Ignore when typing in fields (except Ctrl/Cmd combos we handle)
        const typing = this.isTypingTarget(event.target);
        const mod = event.ctrlKey || event.metaKey;

        // Ctrl/Cmd+Enter → copy current code (works even in inputs)
        if (mod && event.key === 'Enter') {
          event.preventDefault();
          this.copyToken();
          return;
        }

        // Ctrl/Cmd+Shift+C → copy code (avoid clobbering normal copy)
        if (mod && event.shiftKey && (event.key === 'C' || event.key === 'c')) {
          event.preventDefault();
          this.copyToken();
          return;
        }

        if (typing) return;

        // c → copy, s → share link, p → toggle previous, / → focus secret
        if (event.key === 'c' || event.key === 'C') {
          event.preventDefault();
          this.copyToken();
        } else if (event.key === 's' || event.key === 'S') {
          event.preventDefault();
          this.copyShareLink();
        } else if (event.key === 'p' || event.key === 'P') {
          event.preventDefault();
          if (this.previousToken) this.showPrevious = !this.showPrevious;
        } else if (event.key === '/') {
          event.preventDefault();
          const input = document.getElementById('secret');
          if (input) input.focus();
        } else if (event.key === 'Escape') {
          const input = document.getElementById('secret');
          if (input && document.activeElement === input) input.blur();
        }
      };
      window.addEventListener('keydown', this._onKeydown);
    },

    unbindKeyboardShortcuts() {
      if (this._onKeydown) {
        window.removeEventListener('keydown', this._onKeydown);
      }
    },

    startSmoothLoop() {
      if (this._loopRunning) return;
      this._loopRunning = true;

      const loop = () => {
        if (!this._loopRunning) return;
        this.updateProgress();
        const sec = getCurrentSeconds();
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

    updateProgress() {
      const period = Math.max(Number(this.period) || 30, 1);
      const nowMs = getNowMs();
      const elapsedInPeriod = (nowMs / 1000) % period;
      const remaining = period - elapsedInPeriod;

      this.progressFraction = Math.max(0, Math.min(1, remaining / period));
      this.updatingIn = Math.max(0, Math.ceil(remaining));
      if (this.updatingIn === 0) {
        this.updatingIn = period;
      }

      // Soft clock-skew awareness: codes change on whole-second boundaries
      // against period; surface when near rollover for manual cross-check.
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
        // otpauth TOTP.generate accepts { timestamp } in ms
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
        const nowSec = getCurrentSeconds();
        const period = Math.max(Number(this.period) || 30, 1);
        const digits = Number(this.digits) || 6;
        const current = truncateTo(this.totp.generate(), digits);
        const prev = this.generateAt(nowSec - period);
        const upcoming = this.generateAt(nowSec + period);

        if (this._lastToken !== null && this._lastToken !== current) {
          this.triggerDigitFlips(current, this._lastToken);
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
        if (prevChars[i] !== ch) {
          flips[i] = true;
        }
      });

      this.flipKeys = flips;

      clearTimeout(this._flipClearTimer);
      this._flipClearTimer = setTimeout(() => {
        this.flipKeys = {};
      }, 480);
    },

    onSecretInput(event) {
      const value = event && event.target ? event.target.value : this.secret_key;
      const parsed = parseOtpAuthUri(value);
      if (parsed) {
        this.applyOtpAuth(parsed);
        return;
      }
      // Live-normalize only when it looks like a clean secret paste (no spaces mid-edit optional)
      // Keep raw for typing comfort; generation uses normalizedSecret.
      this.secret_key = value;
    },

    onSecretPaste(event) {
      const text = (event.clipboardData || window.clipboardData).getData('text');
      if (!text) return;

      const parsed = parseOtpAuthUri(text);
      if (parsed) {
        event.preventDefault();
        this.applyOtpAuth(parsed);
        this.showCopied('Imported otpauth URI settings');
        return;
      }

      // Normalize pure secret pastes (strip spaces/dashes)
      const cleaned = normalizeSecret(text);
      if (cleaned && cleaned.length >= 8 && isValidBase32(cleaned)) {
        event.preventDefault();
        this.secret_key = cleaned;
        this.showCopied('Secret cleaned & applied');
      }
    },

    applyOtpAuth(parsed) {
      this._suppressSave = true;
      this.secret_key = parsed.secret;
      if (parsed.digits) this.digits = parsed.digits;
      if (parsed.period) this.period = parsed.period;
      if (parsed.algorithm) this.algorithm = parsed.algorithm;
      this.accountLabel = parsed.label || parsed.issuer || null;
      this.showAdvanced = true;
      this._suppressSave = false;
      this.tick();
      this.persistPrefs();
    },

    normalizeSecretField() {
      const cleaned = this.normalizedSecret;
      if (cleaned !== this.secret_key) {
        this.secret_key = cleaned;
      }
      this.tick();
    },

    copyToken() {
      if (!this.token) return;

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(this.token).then(() => {
          this.showCopied('Code copied to clipboard');
        }).catch(() => {
          this.fallbackCopy(this.token, 'Code copied to clipboard');
        });
      } else {
        this.fallbackCopy(this.token, 'Code copied to clipboard');
      }
    },

    copyPrevious() {
      if (!this.previousToken) return;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(this.previousToken).then(() => {
          this.showCopied('Previous code copied');
        }).catch(() => {
          this.fallbackCopy(this.previousToken, 'Previous code copied');
        });
      } else {
        this.fallbackCopy(this.previousToken, 'Previous code copied');
      }
    },

    copyShareLink() {
      const url = this.shareUrl;
      if (!url) {
        this.showCopied('Enter a valid secret first');
        return;
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(() => {
          this.showCopied('Share link copied (uses # fragment)');
        }).catch(() => {
          this.fallbackCopy(url, 'Share link copied (uses # fragment)');
        });
      } else {
        this.fallbackCopy(url, 'Share link copied (uses # fragment)');
      }
    },

    copyOtpAuthUri() {
      const uri = this.otpAuthUri;
      if (!uri) {
        this.showCopied('Enter a valid secret first');
        return;
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(uri).then(() => {
          this.showCopied('otpauth URI copied');
        }).catch(() => {
          this.fallbackCopy(uri, 'otpauth URI copied');
        });
      } else {
        this.fallbackCopy(uri, 'otpauth URI copied');
      }
    },

    copyNext() {
      if (!this.nextToken) return;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(this.nextToken).then(() => {
          this.showCopied('Next period code copied');
        }).catch(() => {
          this.fallbackCopy(this.nextToken, 'Next period code copied');
        });
      } else {
        this.fallbackCopy(this.nextToken, 'Next period code copied');
      }
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
      } catch (e) {
        /* ignore */
      }
      document.body.removeChild(el);
    },

    showCopied(message) {
      this.copied = true;
      this.toastMessage = message || 'Code copied to clipboard';
      this.toastVisible = true;

      clearTimeout(this._copyResetTimer);
      clearTimeout(this._toastTimer);

      this._copyResetTimer = setTimeout(() => {
        this.copied = false;
      }, 1800);

      this._toastTimer = setTimeout(() => {
        this.toastVisible = false;
      }, 2200);
    },

    getKeyFromUrl() {
      const key = document.location.hash.replace(/[#\/]+/, '');
      if (key.length > 0) {
        const parsed = parseOtpAuthUri(decodeURIComponent(key));
        if (parsed) {
          this.applyOtpAuth(parsed);
        } else {
          this.secret_key = normalizeSecret(decodeURIComponent(key)) || key;
        }
      }
    },

    getQueryParameters() {
      const queryParams = parseURLSearch(window.location.search);

      if (queryParams.key) {
        const raw = String(queryParams.key);
        const parsed = parseOtpAuthUri(raw);
        if (parsed) {
          this.applyOtpAuth(parsed);
        } else {
          this.secret_key = normalizeSecret(raw) || raw;
        }
      }
      if (queryParams.digits) this.digits = Number(queryParams.digits);
      if (queryParams.period) this.period = Number(queryParams.period);
      if (queryParams.algorithm) {
        const alg = String(queryParams.algorithm).toUpperCase().replace(/-/g, '');
        if (['SHA1', 'SHA256', 'SHA512'].includes(alg)) {
          this.algorithm = alg;
        }
      }
    },

    clearSecret() {
      this.secret_key = '';
      this.accountLabel = null;
      this.tick();
      this.persistPrefs();
    },

    formatCodeGroups,
  },
});

app.mount('#app');
