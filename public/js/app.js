function getCurrentSeconds() {
  return Math.round(Date.now() / 1000);
}

function getNowMs() {
  return Date.now();
}

function stripSpaces(str) {
  return String(str || '').replace(/\s/g, '');
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

const RING_RADIUS = 50;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

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
      flipKeys: {},
      clipboardButton: null,
      showSecret: true,
      showAdvanced: false,
      copied: false,
      toastVisible: false,
      toastMessage: '',
      secretError: null,
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
    };
  },

  mounted() {
    this.getKeyFromUrl();
    this.getQueryParameters();
    this.tick();
    this.startSmoothLoop();

    this.clipboardButton = new ClipboardJS('#clipboard-button');
    this.clipboardButton.on('success', (e) => {
      this.showCopied();
      e.clearSelection();
    });
  },

  unmounted() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
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

    totp() {
      try {
        const secret = stripSpaces(this.secret_key);
        if (!secret) return null;
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
  },

  watch: {
    secret_key() { this.tick(); },
    digits() { this.tick(); },
    period() { this.tick(); },
    algorithm() { this.tick(); },
  },

  methods: {
    startSmoothLoop() {
      const loop = () => {
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
    },

    tick() {
      this.updateProgress();

      if (!this.totp) {
        this.token = null;
        this._lastToken = null;
        this.secretError = stripSpaces(this.secret_key)
          ? 'Invalid Base32 secret key'
          : 'Enter a secret key';
        return;
      }

      this.secretError = null;

      try {
        const digits = Number(this.digits) || 6;
        const next = truncateTo(this.totp.generate(), digits);

        if (this._lastToken !== null && this._lastToken !== next) {
          this.triggerDigitFlips(next, this._lastToken);
        }

        this.token = next;
        this._lastToken = next;
      } catch (e) {
        this.token = null;
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

    copyToken() {
      if (!this.token) return;

      // Prefer ClipboardJS button path for consistency; also support direct click
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(this.token).then(() => {
          this.showCopied();
        }).catch(() => {
          this.fallbackCopy();
        });
      } else {
        this.fallbackCopy();
      }
    },

    fallbackCopy() {
      const el = document.createElement('textarea');
      el.value = this.token;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand('copy');
        this.showCopied();
      } catch (e) {
        /* ignore */
      }
      document.body.removeChild(el);
    },

    showCopied() {
      this.copied = true;
      this.toastMessage = 'Code copied to clipboard';
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
        this.secret_key = key;
      }
    },

    getQueryParameters() {
      const queryParams = parseURLSearch(window.location.search);

      if (queryParams.key) this.secret_key = queryParams.key;
      if (queryParams.digits) this.digits = Number(queryParams.digits);
      if (queryParams.period) this.period = Number(queryParams.period);
      if (queryParams.algorithm) this.algorithm = queryParams.algorithm;
    },
  },
});

app.mount('#app');
