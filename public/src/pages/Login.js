import { login } from '../store/auth.js';

const html = window.html;
const { useState, useEffect, useRef, useCallback } = window.hooks;

export default function Login() {
  // Mode: 'pin' (default matching Federal Bank reference screenshot) vs 'username'
  const [mode, setMode] = useState('pin');

  // 4-column PIN string or array
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [isShaking, setIsShaking] = useState(false);
  const [activeKey, setActiveKey] = useState(null);

  // Username & Password fallback fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-focus / reset
  useEffect(() => {
    setError('');
  }, [mode]);

  // Execute login with 4-digit PIN
  const executePinLogin = useCallback(async (pinCode) => {
    if (loading) return;
    if (pinCode.length !== 4) {
      setError('Please enter a 4-digit PIN.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      await login({ pin: pinCode });
      if (window.showToast) window.showToast('Welcome to Life Skills Course! ✓', 'success');
      window.location.hash = '#/';
    } catch (err) {
      setError(err.message || 'Invalid 4-digit PIN. Try 1111 for Admin.');
      setIsShaking(true);
      if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
      setTimeout(() => {
        setIsShaking(false);
        setPinDigits(['', '', '', '']);
      }, 500);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // Handle digit entered via keypad or physical keyboard
  const handleInputDigit = useCallback((digitChar) => {
    if (loading || mode !== 'pin') return;
    if (navigator.vibrate) navigator.vibrate(15);

    // Provide visual press feedback
    setActiveKey(digitChar);
    setTimeout(() => setActiveKey(null), 140);

    setPinDigits((prev) => {
      const firstEmptyIdx = prev.findIndex((d) => !d);
      if (firstEmptyIdx === -1) return prev; // already full

      const next = [...prev];
      next[firstEmptyIdx] = digitChar;
      setError('');

      // If this was the 4th digit (index 3), trigger auto-login
      if (firstEmptyIdx === 3) {
        const fullPin = next.join('');
        setTimeout(() => executePinLogin(fullPin), 80);
      }
      return next;
    });
  }, [loading, mode, executePinLogin]);

  // Handle backspace / delete
  const handleBackspace = useCallback(() => {
    if (loading || mode !== 'pin') return;
    if (navigator.vibrate) navigator.vibrate(10);
    setActiveKey('backspace');
    setTimeout(() => setActiveKey(null), 140);

    setPinDigits((prev) => {
      const next = [...prev];
      for (let i = 3; i >= 0; i--) {
        if (next[i]) {
          next[i] = '';
          break;
        }
      }
      return next;
    });
    setError('');
  }, [loading, mode]);

  // Handle clear all
  const handleClear = useCallback(() => {
    if (loading || mode !== 'pin') return;
    if (navigator.vibrate) navigator.vibrate(10);
    setActiveKey('clear');
    setTimeout(() => setActiveKey(null), 140);
    setPinDigits(['', '', '', '']);
    setError('');
  }, [loading, mode]);

  // Physical keyboard listener
  useEffect(() => {
    if (mode !== 'pin') return;

    const onKeyDown = (e) => {
      // Avoid intercepting if an input element has focus
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleInputDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter') {
        const full = pinDigits.join('');
        if (full.length === 4) {
          e.preventDefault();
          executePinLogin(full);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, handleInputDigit, handleBackspace, handleClear, executePinLogin, pinDigits]);

  // Quick Sandbox 1-Click Login
  const handleSandboxEnter = (pinCode) => {
    if (loading) return;
    const digits = pinCode.split('').slice(0, 4);
    setPinDigits(digits);
    executePinLogin(pinCode);
  };

  // Standard Username/Password submission
  const handleUsernameSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login({ username: username.trim(), password });
      if (window.showToast) window.showToast('Signed in successfully! ✓', 'success');
      window.location.hash = '#/';
    } catch (err) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  const currentPinString = pinDigits.join('');
  const firstEmptyIndex = pinDigits.findIndex((d) => !d);
  const activeColumnIndex = firstEmptyIndex === -1 ? 3 : firstEmptyIndex;

  // Keypad definitions: 3 columns x 4 rows
  const keypadRows = [
    [
      { digit: '1', letters: '' },
      { digit: '2', letters: 'ABC' },
      { digit: '3', letters: 'DEF' }
    ],
    [
      { digit: '4', letters: 'GHI' },
      { digit: '5', letters: 'JKL' },
      { digit: '6', letters: 'MNO' }
    ],
    [
      { digit: '7', letters: 'PQRS' },
      { digit: '8', letters: 'TUV' },
      { digit: '9', letters: 'WXYZ' }
    ],
    [
      { type: 'clear', label: 'C', sub: 'CLEAR' },
      { digit: '0', letters: '+' },
      { type: 'backspace', label: '⌫', sub: 'DELETE' }
    ]
  ];

  return html`
    <div style="
      min-height: 100vh;
      background: radial-gradient(circle at 50% 10%, #0d1e24 0%, #081216 65%, #050b0e 100%);
      color: #E2E8F0;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: env(safe-area-inset-top) 16px env(safe-area-inset-bottom);
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    ">
      
      <!-- Keyframe Animations -->
      <style>
        @keyframes bank-shake {
          0%, 100% { transform: translateX(0); }
          15%, 55% { transform: translateX(-8px); }
          35%, 75% { transform: translateX(8px); }
        }
        @keyframes dot-pop {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes cursor-pulse {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.9; }
        }
        .bank-btn-touch {
          transition: transform 0.08s ease, background 0.12s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .bank-btn-touch:active {
          transform: scale(0.93);
          background: rgba(42, 107, 99, 0.4) !important;
        }
      </style>

      <!-- Top Header matching Federal Bank reference screenshot -->
      <header style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 56px;
        padding: 0 4px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      ">
        <button
          type="button"
          onClick=${() => {
            setPinDigits(['', '', '', '']);
            setError('');
          }}
          style="
            background: transparent;
            border: none;
            color: #94A3B8;
            font-size: 22px;
            cursor: pointer;
            padding: 8px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
          "
          title="Clear PIN"
        >
          ✕
        </button>

        <div style="font-size: 15px; font-weight: 600; color: #F1F5F9; letter-spacing: 0.3px;">
          Life Skills · PIN Login
        </div>

        <div style="display: flex; gap: 6px; color: #94A3B8;">
          <button
            type="button"
            onClick=${() => window.showToast ? window.showToast('Fast PIN Access: Enter 1111 for Admin, 2222 for Usthad', 'info') : null}
            style="background: transparent; border: none; color: #94A3B8; font-size: 18px; padding: 6px; cursor: pointer;"
            title="Help & Info"
          >
            <svg style="width: 19px; height: 19px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </button>
          <button
            type="button"
            onClick=${() => {
              if (navigator.share) {
                navigator.share({ title: 'Life Skill Course', url: window.location.href }).catch(() => {});
              }
            }}
            style="background: transparent; border: none; color: #94A3B8; font-size: 18px; padding: 6px; cursor: pointer;"
            title="Share"
          >
            <svg style="width: 19px; height: 19px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
            </svg>
          </button>
        </div>
      </header>

      <!-- Main Central Container -->
      <div style="
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        max-width: 360px;
        width: 100%;
        margin: 0 auto;
        padding: 18px 0 12px;
      ">
        
        <div>
          <!-- Title & Subtitle matching reference screenshot -->
          <div style="margin-bottom: 24px;">
            <h1 style="
              font-size: 32px;
              font-weight: 700;
              color: #FFFFFF;
              margin: 0 0 8px;
              letter-spacing: -0.5px;
              font-family: Georgia, 'Times New Roman', serif, -apple-system;
            ">
              Welcome back
            </h1>
            <p style="font-size: 14px; color: #8BA2AD; margin: 0; line-height: 1.45;">
              ${mode === 'pin'
                ? 'Enter your 4-digit PIN to continue to your life skills lessons.'
                : 'Sign in with your administrator or leader credentials.'}
            </p>
          </div>

          <!-- Error Message Banner -->
          ${error ? html`
            <div style="
              background: rgba(220, 38, 38, 0.16);
              border: 1px solid rgba(220, 38, 38, 0.45);
              color: #FCA5A5;
              padding: 9px 12px;
              border-radius: 10px;
              font-size: 13px;
              margin-bottom: 16px;
              text-align: center;
              line-height: 1.4;
            ">
              ${error}
            </div>
          ` : ''}

          ${mode === 'pin' ? html`
            <!-- 4 COLUMNS PIN DISPLAY (Federal Bank 4 Columns) -->
            <div
              style="
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 12px;
                margin-bottom: 20px;
                animation: ${isShaking ? 'bank-shake 0.45s ease-in-out' : 'none'};
              "
            >
              ${[0, 1, 2, 3].map((index) => {
                const isFilled = Boolean(pinDigits[index]);
                const isActive = index === activeColumnIndex && !isFilled;
                
                return html`
                  <div
                    key=${index}
                    style="
                      height: 72px;
                      background: ${isFilled ? '#14252D' : '#0F1D23'};
                      border: 1.5px solid ${isShaking ? '#EF4444' : (isFilled ? '#2A6B63' : (isActive ? '#3B82F6' : '#1E3640'))};
                      border-radius: 14px;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      position: relative;
                      box-shadow: ${isFilled ? '0 0 14px rgba(42, 107, 99, 0.35)' : 'none'};
                      transition: all 0.15s ease;
                      cursor: pointer;
                    "
                    onClick=${() => {
                      // Click on box clears subsequent digits
                      setPinDigits((prev) => {
                        const copy = [...prev];
                        for (let i = index; i < 4; i++) copy[i] = '';
                        return copy;
                      });
                    }}
                  >
                    ${isFilled ? html`
                      <!-- Masked Glowing Dot -->
                      <div style="
                        width: 14px;
                        height: 14px;
                        border-radius: 50%;
                        background: #FFFFFF;
                        box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
                        animation: dot-pop 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                      "></div>
                    ` : (isActive ? html`
                      <!-- Active Column Cursor Indicator -->
                      <div style="
                        width: 2px;
                        height: 24px;
                        background: #38BDF8;
                        border-radius: 1px;
                        animation: cursor-pulse 1s infinite;
                      "></div>
                    ` : '')}
                  </div>
                `;
              })}
            </div>

            <!-- "Log in" Action Button matching reference screenshot -->
            <button
              type="button"
              class="btn bank-btn-touch"
              onClick=${() => executePinLogin(currentPinString)}
              disabled=${loading || currentPinString.length !== 4}
              style="
                width: 100%;
                height: 52px;
                background: #2A6B63;
                color: #FFFFFF;
                font-size: 16px;
                font-weight: 600;
                border: none;
                border-radius: 12px;
                cursor: pointer;
                transition: opacity 0.15s;
                opacity: ${currentPinString.length === 4 && !loading ? '1' : '0.55'};
                margin-bottom: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
              "
            >
              ${loading ? html`
                <div class="spinner" style="width: 20px; height: 20px; margin: 0; border-width: 2.5px;"></div>
                <span>Verifying PIN...</span>
              ` : 'Log in'}
            </button>

            <!-- 4-DIGIT KEYPAD LAYOUT (0-9, CLEAR, BACKSPACE) -->
            <div style="
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 10px;
              margin-bottom: 18px;
              padding: 0 4px;
            ">
              ${keypadRows.map((row) =>
                row.map((item) => {
                  if (item.type === 'clear') {
                    const isPressed = activeKey === 'clear';
                    return html`
                      <button
                        type="button"
                        class="bank-btn-touch"
                        onClick=${handleClear}
                        disabled=${loading}
                        style="
                          height: 56px;
                          background: ${isPressed ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.04)'};
                          border: 1px solid rgba(255, 255, 255, 0.08);
                          border-radius: 12px;
                          color: #94A3B8;
                          font-size: 13px;
                          font-weight: 700;
                          cursor: pointer;
                          display: flex;
                          flex-direction: column;
                          align-items: center;
                          justify-content: center;
                        "
                        title="Clear all digits"
                      >
                        <span style="font-size: 16px; line-height: 1;">✕</span>
                        <span style="font-size: 9px; opacity: 0.7; margin-top: 2px;">CLEAR</span>
                      </button>
                    `;
                  }

                  if (item.type === 'backspace') {
                    const isPressed = activeKey === 'backspace';
                    return html`
                      <button
                        type="button"
                        class="bank-btn-touch"
                        onClick=${handleBackspace}
                        disabled=${loading}
                        style="
                          height: 56px;
                          background: ${isPressed ? 'rgba(42, 107, 99, 0.4)' : 'rgba(255, 255, 255, 0.04)'};
                          border: 1px solid rgba(255, 255, 255, 0.08);
                          border-radius: 12px;
                          color: #CBD5E1;
                          font-size: 18px;
                          font-weight: 600;
                          cursor: pointer;
                          display: flex;
                          flex-direction: column;
                          align-items: center;
                          justify-content: center;
                        "
                        title="Delete previous digit"
                      >
                        <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H20a2 2 0 012 2v10a2 2 0 01-2 2h-9.172a2 2 0 01-1.414-.586L3 12z"></path>
                        </svg>
                        <span style="font-size: 9px; opacity: 0.7; margin-top: 2px;">DELETE</span>
                      </button>
                    `;
                  }

                  // Number Digit (0-9)
                  const isPressed = activeKey === item.digit;
                  return html`
                    <button
                      type="button"
                      class="bank-btn-touch"
                      onClick=${() => handleInputDigit(item.digit)}
                      disabled=${loading}
                      style="
                        height: 56px;
                        background: ${isPressed ? 'rgba(42, 107, 99, 0.45)' : 'rgba(255, 255, 255, 0.06)'};
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        border-radius: 12px;
                        color: #FFFFFF;
                        cursor: pointer;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                      "
                    >
                      <span style="font-size: 22px; font-weight: 600; line-height: 1;">${item.digit}</span>
                      ${item.letters ? html`
                        <span style="font-size: 9px; font-weight: 600; color: #8BA2AD; letter-spacing: 1px; margin-top: 2px;">
                          ${item.letters}
                        </span>
                      ` : html`<span style="height: 11px;"></span>`}
                    </button>
                  `;
                })
              )}
            </div>

          ` : html`
            <!-- Standard Username / Password Mode -->
            <form onSubmit=${handleUsernameSubmit} style="margin-bottom: 20px;">
              <div style="margin-bottom: 14px;">
                <label style="display: block; font-size: 13px; font-weight: 500; color: #CBD5E1; margin-bottom: 6px;">
                  Username
                </label>
                <input
                  type="text"
                  class="form-input"
                  style="
                    background: #0F1D23;
                    border: 1.5px solid #1E3640;
                    color: #FFFFFF;
                    padding: 12px;
                    border-radius: 10px;
                    width: 100%;
                  "
                  placeholder="e.g. admin or leader1"
                  value=${username}
                  onInput=${(e) => setUsername(e.target.value)}
                  required
                  disabled=${loading}
                  autocomplete="username"
                />
              </div>

              <div style="margin-bottom: 20px; position: relative;">
                <label style="display: block; font-size: 13px; font-weight: 500; color: #CBD5E1; margin-bottom: 6px;">
                  Password
                </label>
                <div style="position: relative;">
                  <input
                    type=${showPass ? 'text' : 'password'}
                    class="form-input"
                    style="
                      background: #0F1D23;
                      border: 1.5px solid #1E3640;
                      color: #FFFFFF;
                      padding: 12px;
                      padding-right: 56px;
                      border-radius: 10px;
                      width: 100%;
                    "
                    placeholder="Enter account password"
                    value=${password}
                    onInput=${(e) => setPassword(e.target.value)}
                    required
                    disabled=${loading}
                    autocomplete="current-password"
                  />
                  <button
                    type="button"
                    onClick=${() => setShowPass(!showPass)}
                    style="
                      position: absolute;
                      right: 12px;
                      top: 50%;
                      transform: translateY(-50%);
                      background: transparent;
                      border: none;
                      color: #8BA2AD;
                      font-size: 11px;
                      font-weight: 700;
                      cursor: pointer;
                    "
                  >
                    ${showPass ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                class="btn bank-btn-touch"
                disabled=${loading}
                style="
                  width: 100%;
                  height: 52px;
                  background: #2A6B63;
                  color: #FFFFFF;
                  font-size: 16px;
                  font-weight: 600;
                  border: none;
                  border-radius: 12px;
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  gap: 8px;
                "
              >
                ${loading ? html`
                  <div class="spinner" style="width: 20px; height: 20px; margin: 0; border-width: 2.5px;"></div>
                  <span>Signing In...</span>
                ` : 'Sign In with Username'}
              </button>
            </form>
          `}

          <!-- Toggle Button: "In our page use a button login through username" -->
          <button
            type="button"
            class="bank-btn-touch"
            onClick=${() => {
              setMode(mode === 'pin' ? 'username' : 'pin');
              setError('');
            }}
            style="
              width: 100%;
              height: 46px;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.12);
              border-radius: 10px;
              color: #CBD5E1;
              font-size: 13px;
              font-weight: 600;
              cursor: pointer;
              margin-bottom: 18px;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
            "
          >
            <span>${mode === 'pin' ? '🔑 Log in with Username & Password' : '🔢 Switch to 4-Digit Bank PIN Keypad'}</span>
          </button>
        </div>

        <!-- SMALL SANDBOX: 1-Tap Direct Enter for all users -->
        <div style="
          background: rgba(15, 29, 35, 0.75);
          border: 1px solid rgba(42, 107, 99, 0.35);
          border-radius: 12px;
          padding: 12px 10px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        ">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #5EEAD4; display: flex; align-items: center; gap: 4px;">
              <span>⚡</span> Small Sandbox (1-Tap Fast Enter)
            </span>
            <span style="font-size: 10px; color: #8BA2AD;">Auto 4-Digit PIN</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <button
              type="button"
              class="bank-btn-touch"
              onClick=${() => handleSandboxEnter('1111')}
              disabled=${loading}
              style="
                padding: 8px 10px;
                background: #13252E;
                border: 1px solid #1E3844;
                border-radius: 8px;
                color: #F1F5F9;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                text-align: left;
                display: flex;
                align-items: center;
                justify-content: space-between;
              "
            >
              <span>👑 Super Admin</span>
              <span style="background: #2A6B63; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700;">1111</span>
            </button>

            <button
              type="button"
              class="bank-btn-touch"
              onClick=${() => handleSandboxEnter('2222')}
              disabled=${loading}
              style="
                padding: 8px 10px;
                background: #13252E;
                border: 1px solid #1E3844;
                border-radius: 8px;
                color: #F1F5F9;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                text-align: left;
                display: flex;
                align-items: center;
                justify-content: space-between;
              "
            >
              <span>🕌 Usthad</span>
              <span style="background: #2A6B63; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700;">2222</span>
            </button>

            <button
              type="button"
              class="bank-btn-touch"
              onClick=${() => handleSandboxEnter('3333')}
              disabled=${loading}
              style="
                padding: 8px 10px;
                background: #13252E;
                border: 1px solid #1E3844;
                border-radius: 8px;
                color: #F1F5F9;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                text-align: left;
                display: flex;
                align-items: center;
                justify-content: space-between;
              "
            >
              <span>🛡️ Team Leader</span>
              <span style="background: #2A6B63; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700;">3333</span>
            </button>

            <button
              type="button"
              class="bank-btn-touch"
              onClick=${() => handleSandboxEnter('4444')}
              disabled=${loading}
              style="
                padding: 8px 10px;
                background: #13252E;
                border: 1px solid #1E3844;
                border-radius: 8px;
                color: #F1F5F9;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                text-align: left;
                display: flex;
                align-items: center;
                justify-content: space-between;
              "
            >
              <span>👤 Team Member</span>
              <span style="background: #2A6B63; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700;">4444</span>
            </button>
          </div>
        </div>

      </div>

      <!-- Footer Info -->
      <footer style="
        text-align: center;
        padding: 8px 0;
        font-size: 11px;
        color: #64748B;
      ">
        Markazul Hidayathil Islamiyya · Annual Calendar Campaign
      </footer>
    </div>
  `;
}
