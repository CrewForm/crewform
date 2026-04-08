// ─── Theme Types ────────────────────────────────────────────────────────────

export interface ChatTheme {
  mode: 'light' | 'dark';
  primaryColor: string;
  bubblePosition: 'bottom-right' | 'bottom-left';
  bubbleIcon: string;
  brandName: string;
  showBranding: boolean;
}

const DEFAULT_THEME: ChatTheme = {
  mode: 'light',
  primaryColor: '#6bedb9',
  bubblePosition: 'bottom-right',
  bubbleIcon: 'chat',
  brandName: 'CrewForm',
  showBranding: true,
};

export function resolveTheme(partial?: Partial<ChatTheme>): ChatTheme {
  return { ...DEFAULT_THEME, ...partial };
}

// ─── CSS Generation ─────────────────────────────────────────────────────────

export function generateStyles(theme: ChatTheme): string {
  const isDark = theme.mode === 'dark';
  const bg = isDark ? '#1a1a2e' : '#ffffff';
  const bgSecondary = isDark ? '#16213e' : '#f7f8fa';
  const text = isDark ? '#e0e0e0' : '#1a1a2e';
  const textMuted = isDark ? '#8a8a9a' : '#6b7280';
  const border = isDark ? '#2a2a4a' : '#e5e7eb';
  const userBubble = theme.primaryColor;
  const userBubbleText = '#ffffff';
  const assistantBubble = isDark ? '#252547' : '#f0f1f3';
  const assistantBubbleText = text;
  const inputBg = isDark ? '#16213e' : '#ffffff';
  const shadow = isDark
    ? '0 8px 32px rgba(0,0,0,0.4)'
    : '0 8px 32px rgba(0,0,0,0.12)';
  const pos = theme.bubblePosition === 'bottom-left' ? 'left: 20px;' : 'right: 20px;';

  return `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: ${text};
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    .cf-chat-bubble {
      position: fixed;
      bottom: 20px;
      ${pos}
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${userBubble};
      color: ${userBubbleText};
      border: none;
      cursor: pointer;
      box-shadow: ${shadow};
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      z-index: 999998;
    }

    .cf-chat-bubble:hover {
      transform: scale(1.08);
      box-shadow: 0 12px 40px rgba(0,0,0,0.2);
    }

    .cf-chat-bubble svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }

    .cf-chat-window {
      position: fixed;
      bottom: 88px;
      ${pos}
      width: 380px;
      height: 520px;
      max-height: calc(100vh - 120px);
      background: ${bg};
      border-radius: 16px;
      box-shadow: ${shadow};
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 999999;
      opacity: 0;
      transform: translateY(16px) scale(0.96);
      pointer-events: none;
      transition: opacity 0.25s ease, transform 0.25s ease;
    }

    .cf-chat-window.cf-open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    .cf-chat-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      background: ${userBubble};
      color: ${userBubbleText};
    }

    .cf-chat-header-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 16px;
      flex-shrink: 0;
    }

    .cf-chat-header-info {
      flex: 1;
      min-width: 0;
    }

    .cf-chat-header-name {
      font-weight: 600;
      font-size: 15px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cf-chat-header-status {
      font-size: 12px;
      opacity: 0.85;
    }

    .cf-chat-close {
      background: none;
      border: none;
      color: ${userBubbleText};
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      opacity: 0.7;
      transition: opacity 0.15s;
    }

    .cf-chat-close:hover { opacity: 1; }

    .cf-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: ${bgSecondary};
    }

    .cf-msg {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 14px;
      line-height: 1.5;
      word-wrap: break-word;
      animation: cf-msg-in 0.2s ease;
    }

    @keyframes cf-msg-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .cf-msg-user {
      align-self: flex-end;
      background: ${userBubble};
      color: ${userBubbleText};
      border-bottom-right-radius: 4px;
    }

    .cf-msg-assistant {
      align-self: flex-start;
      background: ${assistantBubble};
      color: ${assistantBubbleText};
      border-bottom-left-radius: 4px;
    }

    .cf-msg-assistant code {
      background: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
      padding: 1px 5px;
      border-radius: 4px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 13px;
    }

    .cf-msg-assistant pre {
      background: ${isDark ? '#0d0d1a' : '#f3f4f6'};
      padding: 10px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 6px 0;
      font-size: 13px;
    }

    .cf-msg-assistant pre code {
      background: none;
      padding: 0;
    }

    .cf-msg-assistant strong { font-weight: 600; }
    .cf-msg-assistant em { font-style: italic; }
    .cf-msg-assistant ul, .cf-msg-assistant ol {
      padding-left: 18px;
      margin: 4px 0;
    }

    .cf-msg-welcome {
      align-self: flex-start;
      background: ${assistantBubble};
      color: ${assistantBubbleText};
      border-bottom-left-radius: 4px;
    }

    .cf-msg-typing {
      align-self: flex-start;
      background: ${assistantBubble};
      color: ${textMuted};
      border-bottom-left-radius: 4px;
      display: flex;
      gap: 4px;
      padding: 12px 18px;
    }

    .cf-typing-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${textMuted};
      animation: cf-bounce 1.4s infinite ease-in-out;
    }

    .cf-typing-dot:nth-child(2) { animation-delay: 0.16s; }
    .cf-typing-dot:nth-child(3) { animation-delay: 0.32s; }

    @keyframes cf-bounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }

    .cf-chat-input-area {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid ${border};
      background: ${inputBg};
    }

    .cf-chat-input {
      flex: 1;
      border: 1px solid ${border};
      border-radius: 20px;
      padding: 8px 16px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      background: ${bgSecondary};
      color: ${text};
      transition: border-color 0.15s;
      resize: none;
      max-height: 80px;
      line-height: 1.4;
    }

    .cf-chat-input:focus {
      border-color: ${userBubble};
    }

    .cf-chat-input::placeholder {
      color: ${textMuted};
    }

    .cf-chat-send {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: ${userBubble};
      color: ${userBubbleText};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.15s, transform 0.15s;
      flex-shrink: 0;
    }

    .cf-chat-send:hover { transform: scale(1.05); }
    .cf-chat-send:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    .cf-chat-send svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }

    .cf-chat-branding {
      text-align: center;
      padding: 6px;
      font-size: 11px;
      color: ${textMuted};
      background: ${inputBg};
    }

    .cf-chat-branding a {
      color: ${textMuted};
      text-decoration: none;
    }

    .cf-chat-branding a:hover { text-decoration: underline; }

    @media (max-width: 480px) {
      .cf-chat-window {
        width: calc(100vw - 16px);
        height: calc(100vh - 100px);
        bottom: 80px;
        left: 8px;
        right: 8px;
        border-radius: 12px;
      }
    }
  `;
}
