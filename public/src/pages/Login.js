import { login } from '../store/auth.js';

const html = window.html;
const { useState, useEffect, useRef } = window.hooks;

export default function Login() {
  // Mode: 'pin' (default matching reference screenshot) vs 'username'
  const [mode, setMode] = useState('pin');

  // 4-box PIN values: [digit1, digit2, digit3, digit4]
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);

  // Username/Password values
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Refs for 4 PIN input boxes
  const inputRef0 = useRef(null);
  const inputRef1 = useRef(null);
  const inputRef2 = useRef(null);
  const inputRef3 = useRef(null);
  const inputRefs = [inputRef0, inputRef1, inputRef2, inputRef3];

  // Auto-focus first input box on mount if in PIN mode
  useEffect(() => {
    if (mode === 'pin' && inputRef0.current) {
      setTimeout(() => inputRef0.current && inputRef0.current.focus(), 100);
    }
  }, [mode]);

  // Execute login with given PIN
  const executePinLogin = async (pinCode) => {
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
      setPinDigits(['', '', '', '']);
      if (inputRef0.current) inputRef0.current.focus();
    } finally {
      setLoading(false);
    }
  };

  // Handle individual digit input
  const handleDigitChange = (index, value) => {
    // Only accept numeric digit
    const cleaned = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = cleaned;
    setPinDigits(newDigits);
    setError('');

    if (cleaned && index < 3) {
      // Focus next box
      const nextInput = inputRefs[index + 1].current;
      if (nextInput) nextInput.focus();
    }

    // If 4th digit entered, auto-trigger login
    if (index === 3 && cleaned) {
      const fullPin = newDigits.join('');
      if (fullPin.length === 4) {
        executePinLogin(fullPin);
      }
    }
  };

  // Handle keyboard events (Backspace, Arrow keys)
  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!pinDigits[index] && index > 0) {
        const prevInput = inputRefs[index - 1].current;
        if (prevInput) {
          prevInput.focus();
          const newDigits = [...pinDigits];
          newDigits[index - 1] = '';
          setPinDigits(newDigits);
        }
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs[index - 1].current && inputRefs[index - 1].current.focus();
    } else if (e.key === 'ArrowRight' && index < 3) {
      inputRefs[index + 1].current && inputRefs[index + 1].current.focus();
    }
  };

  // Quick Sandbox 1-Click Login
  const handleSandboxEnter = (pinCode) => {
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

  return html`
    <div style="min-height: 100vh; background: #0A1317; color: #E2E8F0; display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: env(safe-area-inset-top) 16px env(safe-area-inset-bottom); box-sizing: border-box;">
      
      <!-- Top Bar matching reference screenshot -->
      <header style="display: flex; align-items: center; justify-content: space-between; height: 56px; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <button
          type="button"
          onClick=${() => {
            setPinDigits(['', '', '', '']);
            setError('');
          }}
          style="background: transparent; border: none; color: #94A3B8; font-size: 20px; cursor: pointer; padding: 8px; border-radius: 8px;"
          title="Clear"
        >
          ✕
        </button>

        <div style="font-size: 15px; font-weight: 600; color: #F1F5F9; letter-spacing: 0.3px;">
          Life Skills · PIN Login
        </div>

        <div style="display: flex; gap: 8px; color: #94A3B8;">
          <span style="font-size: 16px; padding: 4px;">🔍</span>
          <span style="font-size: 16px; padding: 4px;">↗</span>
        </div>
      </header>

      <!-- Main Login Container -->
      <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; max-width: 380px; width: 100%; margin: 0 auto; padding: 24px 8px;">
        
        <!-- Welcome Title & Subtitle -->
        <div style="margin-bottom: 28px;">
          <h1 style="font-size: 30px; font-weight: 700; color: #FFFFFF; margin: 0 0 8px; letter-spacing: -0.5px; font-family: Georgia, serif, -apple-system;">
            Welcome back
          </h1>
          <p style="font-size: 14px; color: #8BA2AD; margin: 0; line-height: 1.5;">
            ${mode === 'pin'
              ? 'Enter your 4-digit PIN to continue to your life skills lessons.'
              : 'Sign in with your administrator or leader credentials.'}
          </p>
        </div>

        <!-- Error Banner -->
        ${error ? html`
          <div style="background: rgba(220, 38, 38, 0.15); border: 1px solid rgba(220, 38, 38, 0.4); color: #FCA5A5; padding: 10px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 20px; text-align: center;">
            ${error}
          </div>
        ` : ''}

        ${mode === 'pin' ? html`
          <!-- 4 COLUMNS PIN INPUT (Federal Bank style) -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px;">
            ${[0, 1, 2, 3].map((index) => {
              const isFilled = Boolean(pinDigits[index]);
              return html`
                <input
                  key=${index}
                  ref=${inputRefs[index]}
                  type="password"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  maxlength="1"
                  value=${pinDigits[index]}
                  onInput=${(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown=${(e) => handleKeyDown(index, e)}
                  disabled=${loading}
                  style="
                    height: 68px;
                    background: ${isFilled ? '#14252D' : '#0F1D23'};
                    border: 1.5px solid ${isFilled ? '#2A6B63' : '#1E3640'};
                    border-radius: 12px;
                    color: #FFFFFF;
                    font-size: 32px;
                    font-weight: 700;
                    text-align: center;
                    outline: none;
                    transition: all 0.15s ease;
                    box-shadow: ${isFilled ? '0 0 0 2px rgba(42, 107, 99, 0.3)' : 'none'};
                  "
                />
              `;
            })}
          </div>

          <!-- Log in Button matching screenshot -->
          <button
            type="button"
            class="btn"
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
              border-radius: 10px;
              cursor: pointer;
              transition: opacity 0.15s;
              opacity: ${currentPinString.length === 4 && !loading ? '1' : '0.5'};
              margin-bottom: 16px;
            "
          >
            ${loading ? 'Verifying PIN...' : 'Log in'}
          </button>
        ` : html`
          <!-- Standard Username / Password Mode -->
          <form onSubmit=${handleUsernameSubmit} style="margin-bottom: 16px;">
            <div style="margin-bottom: 16px;">
              <label style="display: block; font-size: 13px; font-weight: 500; color: #CBD5E1; margin-bottom: 6px;">
                Username
              </label>
              <input
                type="text"
                class="form-input"
                style="background: #0F1D23; border: 1.5px solid #1E3640; color: #FFFFFF; padding: 12px; border-radius: 10px;"
                placeholder="Enter username (e.g. admin)"
                value=${username}
                onInput=${(e) => setUsername(e.target.value)}
                required
                disabled=${loading}
              />
            </div>

            <div style="margin-bottom: 24px; position: relative;">
              <label style="display: block; font-size: 13px; font-weight: 500; color: #CBD5E1; margin-bottom: 6px;">
                Password
              </label>
              <div style="position: relative;">
                <input
                  type=${showPass ? 'text' : 'password'}
                  class="form-input"
                  style="background: #0F1D23; border: 1.5px solid #1E3640; color: #FFFFFF; padding: 12px; padding-right: 56px; border-radius: 10px;"
                  placeholder="Enter password (e.g. admin123)"
                  value=${password}
                  onInput=${(e) => setPassword(e.target.value)}
                  required
                  disabled=${loading}
                />
                <button
                  type="button"
                  onClick=${() => setShowPass(!showPass)}
                  style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: #8BA2AD; font-size: 12px; font-weight: 600; cursor: pointer;"
                >
                  ${showPass ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              class="btn"
              disabled=${loading}
              style="
                width: 100%;
                height: 52px;
                background: #2A6B63;
                color: #FFFFFF;
                font-size: 16px;
                font-weight: 600;
                border: none;
                border-radius: 10px;
                cursor: pointer;
              "
            >
              ${loading ? 'Signing in...' : 'Sign In with Username'}
            </button>
          </form>
        `}

        <!-- Toggle Button: Login through Username -->
        <button
          type="button"
          onClick=${() => {
            setMode(mode === 'pin' ? 'username' : 'pin');
            setError('');
          }}
          style="
            width: 100%;
            height: 48px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 10px;
            color: #94A3B8;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            margin-bottom: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          "
        >
          <span>${mode === 'pin' ? '🔑 Login through Username' : '🔢 Login through 4-digit PIN'}</span>
        </button>

        <!-- SMALL SANDBOX: 1-Click Fast Access -->
        <div style="background: rgba(15, 29, 35, 0.8); border: 1px solid rgba(42, 107, 99, 0.3); border-radius: 12px; padding: 14px 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #5EEAD4;">
              ⚡ Small Sandbox (1-Tap Direct Enter)
            </span>
            <span style="font-size: 10px; color: #8BA2AD;">Auto 4-Digit PIN</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button
              type="button"
              onClick=${() => handleSandboxEnter('1111')}
              style="padding: 10px 8px; background: #13252E; border: 1px solid #1E3844; border-radius: 8px; color: #F1F5F9; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between;"
            >
              <span>👑 Super Admin</span>
              <span style="background: #2A6B63; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">1111</span>
            </button>

            <button
              type="button"
              onClick=${() => handleSandboxEnter('2222')}
              style="padding: 10px 8px; background: #13252E; border: 1px solid #1E3844; border-radius: 8px; color: #F1F5F9; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between;"
            >
              <span>🕌 Usthad</span>
              <span style="background: #2A6B63; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">2222</span>
            </button>

            <button
              type="button"
              onClick=${() => handleSandboxEnter('3333')}
              style="padding: 10px 8px; background: #13252E; border: 1px solid #1E3844; border-radius: 8px; color: #F1F5F9; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between;"
            >
              <span>🛡️ Team Leader</span>
              <span style="background: #2A6B63; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">3333</span>
            </button>

            <button
              type="button"
              onClick=${() => handleSandboxEnter('4444')}
              style="padding: 10px 8px; background: #13252E; border: 1px solid #1E3844; border-radius: 8px; color: #F1F5F9; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between;"
            >
              <span>👤 Team Member</span>
              <span style="background: #2A6B63; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">4444</span>
            </button>
          </div>
        </div>

      </div>

      <!-- Footer Info -->
      <footer style="text-align: center; padding: 14px 0; font-size: 11px; color: #64748B;">
        Markazul Hidayathil Islamiyya · Annual Calendar Camp
      </footer>
    </div>
  `;
}
