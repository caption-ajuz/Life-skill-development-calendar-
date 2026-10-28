import api from '../services/api.js';
import { login, currentUser } from '../store/auth.js';

const html = window.html;
const { useState, useEffect, useCallback } = window.hooks;

export default function Login() {
  // Primary mode is 'pin' (4-column bank-style PIN login).
  // Users can also switch to 'username' (Username + Password) or 'phone' (Phone + PIN).
  const [mode, setMode] = useState('pin');

  // First Login Password Change state
  const [firstLoginRequired, setFirstLoginRequired] = useState(false);
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [confirmPasswordVal, setConfirmPasswordVal] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [changePassError, setChangePassError] = useState('');

  // 4-column PIN state
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [isShaking, setIsShaking] = useState(false);
  const [activeKey, setActiveKey] = useState(null);

  // Username & Password state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Optional Phone + PIN state
  const [phone, setPhone] = useState('');
  const [phonePin, setPhonePin] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
  }, [mode]);

  // Execute login with 4-digit PIN
  const executePinLogin = useCallback(async (pinCode) => {
    if (loading) return;
    if (!pinCode || pinCode.length !== 4) {
      setError('Please enter your 4-digit PIN.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const loginRes = await login({ pin: pinCode });
      if (loginRes && (loginRes.mustChangePassword || (loginRes.user && loginRes.user.mustChangePassword))) {
        setFirstLoginRequired(true);
        return;
      }
      if (window.showToast) window.showToast('Welcome back to Life Skill Course', 'success');
      window.location.hash = '#/';
    } catch (err) {
      setError(err.message || 'Invalid 4-digit PIN. Try 7863 for Super Admin.');
      setIsShaking(true);
      if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
      setTimeout(() => {
        setIsShaking(false);
        setPinDigits(['', '', '', '']);
      }, 480);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // Handle digit entered via on-screen keypad or physical keyboard
  const handleInputDigit = useCallback((digitChar) => {
    if (loading || mode !== 'pin') return;
    if (navigator.vibrate) navigator.vibrate(12);

    setActiveKey(digitChar);
    setTimeout(() => setActiveKey(null), 130);

    setPinDigits((prev) => {
      const firstEmptyIdx = prev.findIndex((d) => !d);
      if (firstEmptyIdx === -1) return prev;

      const next = [...prev];
      next[firstEmptyIdx] = digitChar;
      setError('');

      if (firstEmptyIdx === 3) {
        const fullPin = next.join('');
        setTimeout(() => executePinLogin(fullPin), 90);
      }
      return next;
    });
  }, [loading, mode, executePinLogin]);

  // Handle backspace
  const handleBackspace = useCallback(() => {
    if (loading || mode !== 'pin') return;
    if (navigator.vibrate) navigator.vibrate(10);
    setActiveKey('backspace');
    setTimeout(() => setActiveKey(null), 130);

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
    setTimeout(() => setActiveKey(null), 130);
    setPinDigits(['', '', '', '']);
    setError('');
  }, [loading, mode]);

  // Physical keyboard support
  useEffect(() => {
    if (mode !== 'pin') return;

    const onKeyDown = (e) => {
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

  // 1-Tap Sandbox direct entry
  const handleSandboxEnter = (pinCode) => {
    if (loading) return;
    setMode('pin');
    const digits = pinCode.split('').slice(0, 4);
    setPinDigits(digits);
    executePinLogin(pinCode);
  };

  // Username & Password login submission
  const handleUsernameSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const loginRes = await login({ username: username.trim(), password });
      if (loginRes && (loginRes.mustChangePassword || (loginRes.user && loginRes.user.mustChangePassword))) {
        setFirstLoginRequired(true);
        return;
      }
      if (window.showToast) window.showToast('Signed in successfully', 'success');
      window.location.hash = '#/';
    } catch (err) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  // Phone + PIN login submission
  const handlePhonePinSubmit = async (e) => {
    e.preventDefault();
    if (!phone.trim() || !phonePin.trim()) {
      setError('Please enter your registered phone number and PIN.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const loginRes = await login({ phone: phone.trim(), pin: phonePin.trim() });
      if (loginRes && (loginRes.mustChangePassword || (loginRes.user && loginRes.user.mustChangePassword))) {
        setFirstLoginRequired(true);
        return;
      }
      if (window.showToast) window.showToast('Signed in successfully', 'success');
      window.location.hash = '#/';
    } catch (err) {
      setError(err.message || 'Invalid phone number or PIN.');
    } finally {
      setLoading(false);
    }
  };

  // First Login — Set New Password submission
  const handleFirstLoginSubmit = async (e) => {
    e.preventDefault();
    if (!newPasswordVal || newPasswordVal.length < 6) {
      setChangePassError('Password must be at least 6 characters long.');
      return;
    }
    if (newPasswordVal !== confirmPasswordVal) {
      setChangePassError('Passwords do not match. Please re-enter.');
      return;
    }
    setChangingPassword(true);
    setChangePassError('');
    try {
      const res = await api.post('/api/auth/first-login-change-password', {
        newPassword: newPasswordVal
      });
      if (res && res.success) {
        if (currentUser.value) {
          currentUser.value.mustChangePassword = false;
        }
        if (window.showToast) window.showToast('Password updated successfully! Welcome to Life Skill Course.', 'success');
        setFirstLoginRequired(false);
        window.location.hash = '#/';
      }
    } catch (err) {
      setChangePassError(err.message || 'Failed to update password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const currentPinString = pinDigits.join('');
  const firstEmptyIndex = pinDigits.findIndex((d) => !d);
  const activeColumnIndex = firstEmptyIndex === -1 ? 3 : firstEmptyIndex;

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
      { type: 'clear', label: 'CLR' },
      { digit: '0', letters: '' },
      { type: 'backspace', label: 'DEL' }
    ]
  ];

  return html`
    <div style="
      min-height: 100vh;
      background: radial-gradient(circle at 50% -10%, #e0f2fe 0%, #f0f9ff 38%, #f8fafc 100%);
      color: #0f172a;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    ">
      <style>
        @keyframes pin-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        @keyframes pin-dot-pop {
          0% { transform: scale(0.3); opacity: 0; }
          65% { transform: scale(1.18); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pin-cursor-blink {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
        .lsc-touch-btn {
          transition: transform 0.08s ease, background-color 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .lsc-touch-btn:active {
          transform: scale(0.96);
        }
        .lsc-input-light {
          width: 100%;
          padding: 13px 14px;
          background: #ffffff;
          border: 1.5px solid #cbd5e1;
          border-radius: 12px;
          color: #0f172a;
          font-size: 15px;
          outline: none;
          box-shadow: 0 1px 2px rgba(0,0,0,0.03);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .lsc-input-light:focus {
          border-color: #0284c7;
          box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.18);
        }
        .lsc-input-light::placeholder {
          color: #94a3b8;
        }
      </style>

      <!-- Top App Bar (Clean Light Navigation matching brand and reference) -->
      <header style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 56px;
        padding: 0 16px;
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-bottom: 1px solid #e2e8f0;
      ">
        <button
          type="button"
          class="lsc-touch-btn"
          onClick=${() => {
            setPinDigits(['', '', '', '']);
            setError('');
            if (mode !== 'pin') setMode('pin');
          }}
          style="
            background: transparent;
            border: none;
            color: #475569;
            width: 38px;
            height: 38px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          "
          title="Reset"
        >
          <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div style="font-size: 16px; font-weight: 700; color: #0f172a; letter-spacing: -0.2px;">
          Life Skills · PIN Login
        </div>

        <div style="display: flex; align-items: center; gap: 4px;">
          <button
            type="button"
            class="lsc-touch-btn"
            onClick=${() => {
              if (window.showToast) {
                window.showToast('Quick PINs: 7863 (Admin) · 2222 (Usthad) · 3333 (Leader) · 4444 (Member)', 'info', 4000);
              }
            }}
            style="
              background: transparent;
              border: none;
              color: #475569;
              width: 38px;
              height: 38px;
              border-radius: 10px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
            "
            title="PIN Help"
          >
            <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </button>
          <button
            type="button"
            class="lsc-touch-btn"
            onClick=${() => {
              if (navigator.share) {
                navigator.share({ title: 'Life Skill Course', url: window.location.href }).catch(() => {});
              }
            }}
            style="
              background: transparent;
              border: none;
              color: #475569;
              width: 38px;
              height: 38px;
              border-radius: 10px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
            "
            title="Share Portal"
          >
            <svg style="width: 19px; height: 19px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </button>
        </div>
      </header>

      <!-- Main Body -->
      <div style="
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        max-width: 390px;
        width: 100%;
        margin: 0 auto;
        padding: 16px 20px 14px;
      ">
        <div>
          <!-- Organization Identity Card (Marketing Logo colors: Vibrant Sky / Cerulean Blue & Pure White) -->
          <div style="
            display: inline-flex;
            align-items: center;
            gap: 12px;
            background: #ffffff;
            border: 1.5px solid #e0f2fe;
            box-shadow: 0 4px 14px rgba(2, 132, 199, 0.08);
            border-radius: 14px;
            padding: 7px 14px 7px 7px;
            margin-bottom: 18px;
          ">
            <img
              src="/logo.jpg"
              alt="Markazul Hidayathil Islamiyya"
              style="
                width: 36px;
                height: 36px;
                border-radius: 10px;
                object-fit: contain;
                background: #ffffff;
                padding: 2px;
                border: 1px solid #bae6fd;
              "
            />
            <div style="line-height: 1.25;">
              <div style="font-size: 13px; font-weight: 700; color: #0f172a; letter-spacing: -0.1px;">
                Markazul Hidayathil Islamiyya
              </div>
              <div style="font-size: 11px; font-weight: 600; color: #0284c7;">
                Annual Calendar Camp Portal
              </div>
            </div>
          </div>

          <!-- Editorial Greeting ("Welcome back" vs "First-Time Setup") -->
          <div style="margin-bottom: 20px;">
            <h1 style="
              font-family: Georgia, 'Times New Roman', Times, serif;
              font-size: 32px;
              font-weight: 700;
              color: #0f172a;
              margin: 0 0 6px;
              letter-spacing: -0.5px;
            ">
              ${firstLoginRequired ? 'First-Time Setup' : 'Welcome back'}
            </h1>
            <p style="
              font-size: 14.5px;
              color: #475569;
              margin: 0;
              line-height: 1.45;
              font-weight: 500;
            ">
              ${firstLoginRequired
                ? 'Your account was created or reset with temporary credentials. Please set your secure personal password to continue.'
                : mode === 'pin'
                ? 'Enter your 4-digit PIN to continue to your life skills lessons.'
                : mode === 'username'
                ? 'Sign in with your administrator or team leader username.'
                : 'Sign in with your registered phone number and PIN.'}
            </p>
          </div>

          <!-- Error Banner -->
          ${error ? html`
            <div style="
              background: #fef2f2;
              border: 1.5px solid #fecdd3;
              color: #b91c1c;
              padding: 10px 14px;
              border-radius: 12px;
              font-size: 13px;
              margin-bottom: 16px;
              text-align: center;
              font-weight: 600;
              box-shadow: 0 1px 3px rgba(220, 38, 38, 0.08);
            ">
              ${error}
            </div>
          ` : ''}

          ${firstLoginRequired ? html`
            <!-- First Login Password Change Card -->
            <div style="
              background: #ffffff;
              border: 1.5px solid #0284c7;
              border-radius: 16px;
              padding: 20px;
              box-shadow: 0 8px 24px rgba(2, 132, 199, 0.12);
              margin-bottom: 18px;
            ">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <div style="width: 38px; height: 38px; border-radius: 10px; background: #e0f2fe; color: #0284c7; display: flex; align-items: center; justify-content: center; font-size: 18px;">
                  🔒
                </div>
                <div>
                  <div style="font-size: 16px; font-weight: 700; color: #0f172a;">Set Permanent Password</div>
                  <div style="font-size: 12px; color: #64748b;">Must be at least 6 characters</div>
                </div>
              </div>

              ${changePassError ? html`
                <div style="background: #fef2f2; border: 1.5px solid #fecdd3; color: #b91c1c; padding: 10px 14px; border-radius: 12px; font-size: 13px; margin-bottom: 14px; font-weight: 600;">
                  ${changePassError}
                </div>
              ` : ''}

              <form onSubmit=${handleFirstLoginSubmit}>
                <div style="margin-bottom: 14px;">
                  <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                    New Password
                  </label>
                  <input
                    type="password"
                    class="lsc-input-light"
                    placeholder="Enter new secure password"
                    value=${newPasswordVal}
                    onInput=${(e) => setNewPasswordVal(e.target.value)}
                    required
                    minLength="6"
                    disabled=${changingPassword}
                  />
                </div>
                <div style="margin-bottom: 18px;">
                  <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    class="lsc-input-light"
                    placeholder="Confirm new password"
                    value=${confirmPasswordVal}
                    onInput=${(e) => setConfirmPasswordVal(e.target.value)}
                    required
                    minLength="6"
                    disabled=${changingPassword}
                  />
                </div>
                <button
                  type="submit"
                  class="lsc-touch-btn"
                  disabled=${changingPassword}
                  style="
                    width: 100%;
                    height: 50px;
                    background: linear-gradient(135deg, #0284c7 0%, #1d4ed8 100%);
                    color: #ffffff;
                    font-size: 15px;
                    font-weight: 700;
                    border: none;
                    border-radius: 12px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
                  "
                >
                  ${changingPassword ? 'Saving Password...' : 'Save Password & Enter Dashboard →'}
                </button>
              </form>
            </div>
          ` : html`
            <div>
              ${mode === 'pin' ? html`
                <!-- 4-Column Bank-Style PIN Boxes (Bright Light Mode with Cerulean Glow) -->
                <div
                  style="
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 12px;
                margin-bottom: 16px;
                animation: ${isShaking ? 'pin-shake 0.45s ease-in-out' : 'none'};
              "
            >
              ${[0, 1, 2, 3].map((index) => {
                const digit = pinDigits[index];
                const isFilled = Boolean(digit);
                const isActive = index === activeColumnIndex && !isFilled;

                return html`
                  <div
                    key=${index}
                    onClick=${() => {
                      setPinDigits((prev) => {
                        const copy = [...prev];
                        for (let i = index; i < 4; i++) copy[i] = '';
                        return copy;
                      });
                    }}
                    style="
                      height: 68px;
                      background: ${isFilled ? '#f0f9ff' : '#ffffff'};
                      border: 2px solid ${
                        isShaking
                          ? '#ef4444'
                          : isFilled
                          ? '#0284c7'
                          : isActive
                          ? '#0ea5e9'
                          : '#cbd5e1'
                      };
                      border-radius: 14px;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      cursor: pointer;
                      box-shadow: ${
                        isShaking
                          ? '0 0 0 4px rgba(239, 68, 68, 0.15)'
                          : isFilled
                          ? '0 4px 14px rgba(2, 132, 199, 0.18)'
                          : isActive
                          ? '0 0 0 4px rgba(14, 165, 233, 0.18)'
                          : '0 2px 4px rgba(0, 0, 0, 0.04)'
                      };
                      transition: all 0.15s ease;
                    "
                  >
                    ${isFilled ? html`
                      <div style="
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                        background: linear-gradient(135deg, #0284c7 0%, #1d4ed8 100%);
                        box-shadow: 0 2px 8px rgba(2, 132, 199, 0.45);
                        animation: pin-dot-pop 0.16s ease-out;
                      "></div>
                    ` : isActive ? html`
                      <div style="
                        width: 2.5px;
                        height: 26px;
                        background: #0284c7;
                        border-radius: 1px;
                        animation: pin-cursor-blink 0.9s infinite;
                      "></div>
                    ` : ''}
                  </div>
                `;
              })}
            </div>

            <!-- Primary "Log in" Button in Bright Marketing Cerulean/Ocean Blue -->
            <button
              type="button"
              class="lsc-touch-btn"
              onClick=${() => executePinLogin(currentPinString)}
              disabled=${loading}
              style="
                width: 100%;
                height: 52px;
                background: ${currentPinString.length === 4
                  ? 'linear-gradient(135deg, #0284c7 0%, #1d4ed8 100%)'
                  : 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)'};
                color: #ffffff;
                font-size: 16px;
                font-weight: 700;
                border: none;
                border-radius: 12px;
                cursor: pointer;
                margin-bottom: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                box-shadow: 0 4px 16px rgba(2, 132, 199, 0.35);
              "
            >
              ${loading ? html`
                <div class="spinner" style="width: 18px; height: 18px; margin: 0; border-width: 2px; border-color: rgba(255,255,255,0.3); border-top-color: #ffffff;"></div>
                <span>Opening Account...</span>
              ` : 'Log in'}
            </button>

            <!-- Tactile 4-Digit Keypad (Bright Crisp White Buttons with Slate Numerals) -->
            <div style="
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 9px;
              margin-bottom: 14px;
            ">
              ${keypadRows.map((row) =>
                row.map((item) => {
                  if (item.type === 'clear') {
                    const isPressed = activeKey === 'clear';
                    return html`
                      <button
                        type="button"
                        class="lsc-touch-btn"
                        onClick=${handleClear}
                        disabled=${loading}
                        style="
                          height: 52px;
                          background: ${isPressed ? '#fee2e2' : '#fef2f2'};
                          border: 1.5px solid #fecdd3;
                          border-radius: 12px;
                          color: #dc2626;
                          font-size: 12px;
                          font-weight: 800;
                          letter-spacing: 0.6px;
                          cursor: pointer;
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          box-shadow: 0 1px 2px rgba(220, 38, 38, 0.05);
                        "
                      >
                        CLEAR
                      </button>
                    `;
                  }

                  if (item.type === 'backspace') {
                    const isPressed = activeKey === 'backspace';
                    return html`
                      <button
                        type="button"
                        class="lsc-touch-btn"
                        onClick=${handleBackspace}
                        disabled=${loading}
                        style="
                          height: 52px;
                          background: ${isPressed ? '#e0f2fe' : '#ffffff'};
                          border: 1.5px solid ${isPressed ? '#38bdf8' : '#e2e8f0'};
                          border-radius: 12px;
                          color: ${isPressed ? '#0284c7' : '#475569'};
                          cursor: pointer;
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
                        "
                        title="Delete"
                      >
                        <svg style="width: 22px; height: 22px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H20a2 2 0 012 2v10a2 2 0 01-2 2h-9.172a2 2 0 01-1.414-.586L3 12z" />
                        </svg>
                      </button>
                    `;
                  }

                  const isPressed = activeKey === item.digit;
                  return html`
                    <button
                      type="button"
                      class="lsc-touch-btn"
                      onClick=${() => handleInputDigit(item.digit)}
                      disabled=${loading}
                      style="
                        height: 52px;
                        background: ${isPressed ? '#e0f2fe' : '#ffffff'};
                        border: 1.5px solid ${isPressed ? '#38bdf8' : '#e2e8f0'};
                        border-radius: 12px;
                        color: #0f172a;
                        cursor: pointer;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
                      "
                    >
                      <span style="font-size: 22px; font-weight: 700; line-height: 1.05; color: #0f172a;">${item.digit}</span>
                      ${item.letters ? html`
                        <span style="font-size: 9px; font-weight: 700; color: #64748b; letter-spacing: 1.1px; margin-top: 1px;">
                          ${item.letters}
                        </span>
                      ` : ''}
                    </button>
                  `;
                })
              )}
            </div>
          ` : mode === 'username' ? html`
            <!-- Username & Password Login Form in Bright Light Mode -->
            <form onSubmit=${handleUsernameSubmit} style="margin-bottom: 16px;">
              <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                  Username
                </label>
                <input
                  type="text"
                  class="lsc-input-light"
                  placeholder="Enter username (e.g. admin)"
                  value=${username}
                  onInput=${(e) => setUsername(e.target.value)}
                  required
                  disabled=${loading}
                  autocomplete="username"
                />
              </div>

              <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                  Password
                </label>
                <div style="position: relative;">
                  <input
                    type=${showPass ? 'text' : 'password'}
                    class="lsc-input-light"
                    style="padding-right: 60px;"
                    placeholder="Enter password"
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
                      color: #0284c7;
                      font-size: 11px;
                      font-weight: 800;
                      cursor: pointer;
                    "
                  >
                    ${showPass ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                class="lsc-touch-btn"
                disabled=${loading}
                style="
                  width: 100%;
                  height: 52px;
                  background: linear-gradient(135deg, #0284c7 0%, #1d4ed8 100%);
                  color: #ffffff;
                  font-size: 16px;
                  font-weight: 700;
                  border: none;
                  border-radius: 12px;
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  gap: 8px;
                  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
                "
              >
                ${loading ? 'Signing In...' : 'Log in with Username'}
              </button>
            </form>
          ` : html`
            <!-- Phone + PIN Login Form in Bright Light Mode -->
            <form onSubmit=${handlePhonePinSubmit} style="margin-bottom: 16px;">
              <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                  Phone Number
                </label>
                <input
                  type="tel"
                  class="lsc-input-light"
                  placeholder="Enter registered phone number"
                  value=${phone}
                  onInput=${(e) => setPhone(e.target.value)}
                  required
                  disabled=${loading}
                />
              </div>

              <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                  4-Digit or 6-Digit PIN
                </label>
                <input
                  type="password"
                  inputmode="numeric"
                  maxlength="6"
                  class="lsc-input-light"
                  placeholder="Enter your PIN"
                  value=${phonePin}
                  onInput=${(e) => setPhonePin(e.target.value)}
                  required
                  disabled=${loading}
                />
              </div>

              <button
                type="submit"
                class="lsc-touch-btn"
                disabled=${loading}
                style="
                  width: 100%;
                  height: 52px;
                  background: linear-gradient(135deg, #0284c7 0%, #1d4ed8 100%);
                  color: #ffffff;
                  font-size: 16px;
                  font-weight: 700;
                  border: none;
                  border-radius: 12px;
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
                "
              >
                ${loading ? 'Signing In...' : 'Log in with Phone + PIN'}
              </button>
            </form>
          `}

          <!-- Secondary Login Mode Switcher Buttons (Crisp Light Cards) -->
          <div style="display: flex; gap: 8px; margin-bottom: 14px;">
            <button
              type="button"
              class="lsc-touch-btn"
              onClick=${() => setMode(mode === 'username' ? 'pin' : 'username')}
              style="
                flex: 1;
                height: 44px;
                background: #ffffff;
                border: 1.5px solid #bae6fd;
                border-radius: 12px;
                color: #0284c7;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                box-shadow: 0 1px 3px rgba(2, 132, 199, 0.08);
              "
            >
              <span>${mode === 'username' ? '🔢 4-Digit PIN Keypad' : '👤 Login through Username'}</span>
            </button>

            <button
              type="button"
              class="lsc-touch-btn"
              onClick=${() => setMode(mode === 'phone' ? 'pin' : 'phone')}
              style="
                padding: 0 14px;
                height: 44px;
                background: #ffffff;
                border: 1.5px solid #e2e8f0;
                border-radius: 12px;
                color: #475569;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                white-space: nowrap;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
              "
            >
              ${mode === 'phone' ? '4-Digit PIN' : 'Phone + PIN'}
            </button>
          </div>
        </div>
      `}

      </div>
    </div>
  `;
}
