// ─── CrewForm Embeddable Chat Widget ────────────────────────────────────────
// Usage:
//   <script src="https://runner.crewform.tech/chat/widget.js" data-key="cf_chat_xxx" async></script>
// Or:
//   CrewFormChat.init({ apiKey: 'cf_chat_xxx', theme: 'dark' });

import { ChatApi } from './api';
import type { WidgetConfig, ChatMessageData } from './api';
import { generateStyles, resolveTheme } from './styles';
import type { ChatTheme } from './styles';

// ─── Markdown Renderer ──────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Code blocks (``` ... ```)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Line breaks
    .replace(/\n/g, '<br>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*?<\/li><br>?)+)/g, (match) => {
    const items = match.replace(/<br>/g, '');
    return `<ul>${items}</ul>`;
  });

  return html;
}

// ─── SVG Icons ──────────────────────────────────────────────────────────────

const ICON_CHAT = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
const ICON_SEND = `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;

// ─── Widget Class ───────────────────────────────────────────────────────────

class CrewFormChatWidget {
  private api: ChatApi;
  private config: WidgetConfig | null = null;
  private theme: ChatTheme;
  private visitorId: string;
  private shadow: ShadowRoot;
  private container: HTMLDivElement;
  private messagesEl!: HTMLDivElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private windowEl!: HTMLDivElement;
  private isOpen = false;
  private isSending = false;
  private messages: ChatMessageData[] = [];

  constructor(options: {
    apiKey: string;
    baseUrl?: string;
    theme?: string | Partial<ChatTheme>;
    position?: 'bottom-right' | 'bottom-left';
  }) {
    const baseUrl = options.baseUrl ?? this.inferBaseUrl();
    this.api = new ChatApi(baseUrl, options.apiKey);

    // Resolve theme
    let themePartial: Partial<ChatTheme> = {};
    if (typeof options.theme === 'string') {
      themePartial.mode = options.theme === 'dark' ? 'dark' : 'light';
    } else if (options.theme) {
      themePartial = options.theme;
    }
    if (options.position) themePartial.bubblePosition = options.position;
    this.theme = resolveTheme(themePartial);

    // Visitor ID (persistent per-domain)
    this.visitorId = this.getOrCreateVisitorId();

    // Create shadow DOM host
    this.container = document.createElement('div');
    this.container.id = 'crewform-chat-widget';
    document.body.appendChild(this.container);
    this.shadow = this.container.attachShadow({ mode: 'closed' });

    // Initialize
    void this.init();
  }

  private inferBaseUrl(): string {
    // Try to infer from the script tag
    const scripts = document.querySelectorAll('script[data-key]');
    for (const script of scripts) {
      const src = script.getAttribute('src');
      if (src?.includes('chat/widget')) {
        try {
          const url = new URL(src);
          return url.origin;
        } catch { /* fall through */ }
      }
    }
    return 'https://runner.crewform.tech';
  }

  private getOrCreateVisitorId(): string {
    const key = 'cf_chat_visitor_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(key, id);
    }
    return id;
  }

  private async init() {
    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = generateStyles(this.theme);
    this.shadow.appendChild(styleEl);

    // Fetch config (get agent name, welcome message, etc.)
    try {
      this.config = await this.api.getConfig();
      // Merge server theme with local overrides
      if (this.config.theme) {
        this.theme = resolveTheme({ ...this.config.theme as Partial<ChatTheme>, ...this.theme });
      }
    } catch (err) {
      console.warn('[CrewForm Chat] Failed to fetch config:', err);
      this.config = {
        widgetId: '',
        agentName: 'Assistant',
        agentDescription: '',
        welcomeMessage: 'Hi! How can I help you?',
        placeholderText: 'Type a message...',
        theme: {},
      };
    }

    // Load message history
    try {
      this.messages = await this.api.getHistory(this.visitorId);
    } catch { /* start fresh */ }

    // Render UI
    this.render();
  }

  private render() {
    const agentName = this.config?.agentName ?? 'Assistant';
    const initial = agentName.charAt(0).toUpperCase();
    const welcomeMsg = this.config?.welcomeMessage ?? 'Hi! How can I help you?';
    const placeholder = this.config?.placeholderText ?? 'Type a message...';

    // Build DOM
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <button class="cf-chat-bubble" aria-label="Open chat">${ICON_CHAT}</button>

      <div class="cf-chat-window">
        <div class="cf-chat-header">
          <div class="cf-chat-header-avatar">${initial}</div>
          <div class="cf-chat-header-info">
            <div class="cf-chat-header-name">${agentName}</div>
            <div class="cf-chat-header-status">Online</div>
          </div>
          <button class="cf-chat-close" aria-label="Close chat">${ICON_CLOSE}</button>
        </div>

        <div class="cf-chat-messages"></div>

        <div class="cf-chat-input-area">
          <textarea
            class="cf-chat-input"
            placeholder="${placeholder}"
            rows="1"
            aria-label="Message"
          ></textarea>
          <button class="cf-chat-send" aria-label="Send message" disabled>${ICON_SEND}</button>
        </div>

        ${this.theme.showBranding ? `
          <div class="cf-chat-branding">
            Powered by <a href="https://crewform.tech" target="_blank" rel="noopener">${this.theme.brandName}</a>
          </div>
        ` : ''}
      </div>
    `;

    this.shadow.appendChild(wrapper);

    // Cache DOM refs
    const bubble = this.shadow.querySelector('.cf-chat-bubble') as HTMLButtonElement;
    this.windowEl = this.shadow.querySelector('.cf-chat-window') as HTMLDivElement;
    this.messagesEl = this.shadow.querySelector('.cf-chat-messages') as HTMLDivElement;
    this.inputEl = this.shadow.querySelector('.cf-chat-input') as HTMLTextAreaElement;
    this.sendBtn = this.shadow.querySelector('.cf-chat-send') as HTMLButtonElement;
    const closeBtn = this.shadow.querySelector('.cf-chat-close') as HTMLButtonElement;

    // Event listeners
    bubble.addEventListener('click', () => this.toggle());
    closeBtn.addEventListener('click', () => this.toggle());

    this.inputEl.addEventListener('input', () => {
      this.sendBtn.disabled = !this.inputEl.value.trim() || this.isSending;
      // Auto-resize textarea
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 80) + 'px';
    });

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.send();
      }
    });

    this.sendBtn.addEventListener('click', () => void this.send());

    // Render existing messages or welcome message
    if (this.messages.length > 0) {
      for (const msg of this.messages) {
        this.renderMessage(msg.role, msg.content);
      }
    } else {
      this.renderMessage('welcome', welcomeMsg);
    }
  }

  private toggle() {
    this.isOpen = !this.isOpen;
    this.windowEl.classList.toggle('cf-open', this.isOpen);

    if (this.isOpen) {
      this.scrollToBottom();
      setTimeout(() => this.inputEl.focus(), 300);
    }
  }

  private renderMessage(role: 'user' | 'assistant' | 'welcome', content: string): HTMLDivElement {
    const msgEl = document.createElement('div');
    msgEl.className = `cf-msg cf-msg-${role}`;

    if (role === 'assistant' || role === 'welcome') {
      msgEl.innerHTML = renderMarkdown(content);
    } else {
      msgEl.textContent = content;
    }

    this.messagesEl.appendChild(msgEl);
    this.scrollToBottom();
    return msgEl;
  }

  private showTyping(): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'cf-msg cf-msg-typing';
    el.innerHTML = `
      <span class="cf-typing-dot"></span>
      <span class="cf-typing-dot"></span>
      <span class="cf-typing-dot"></span>
    `;
    this.messagesEl.appendChild(el);
    this.scrollToBottom();
    return el;
  }

  private scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }

  private async send() {
    const message = this.inputEl.value.trim();
    if (!message || this.isSending) return;

    this.isSending = true;
    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this.sendBtn.disabled = true;

    // Render user message
    this.renderMessage('user', message);

    // Show typing indicator
    const typingEl = this.showTyping();

    // Create assistant message element (will be filled via streaming)
    let assistantEl: HTMLDivElement | null = null;
    let fullContent = '';

    try {
      await this.api.sendMessage(message, this.visitorId, (event) => {
        if (event.type === 'delta') {
          // Remove typing indicator on first delta
          if (!assistantEl) {
            typingEl.remove();
            assistantEl = document.createElement('div');
            assistantEl.className = 'cf-msg cf-msg-assistant';
            this.messagesEl.appendChild(assistantEl);
          }

          fullContent += event.content;
          assistantEl.innerHTML = renderMarkdown(fullContent);
          this.scrollToBottom();
        } else if (event.type === 'done') {
          if (!assistantEl) {
            typingEl.remove();
            // Non-streaming response — render all at once
            fullContent = event.content;
            this.renderMessage('assistant', fullContent);
          }
        } else if (event.type === 'error') {
          typingEl.remove();
          this.renderMessage('assistant', `⚠️ ${event.content}`);
        }
      });
    } catch (err) {
      typingEl.remove();
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      this.renderMessage('assistant', `⚠️ ${msg}`);
    }

    // Save to local messages cache
    if (fullContent) {
      this.messages.push(
        { role: 'user', content: message, timestamp: Date.now() },
        { role: 'assistant', content: fullContent, timestamp: Date.now() },
      );
    }

    this.isSending = false;
    this.sendBtn.disabled = !this.inputEl.value.trim();
    this.inputEl.focus();
  }

  /** Remove the widget from the page */
  destroy() {
    this.container.remove();
  }
}

// ─── Global API & Auto-Init ─────────────────────────────────────────────────

interface CrewFormChatGlobal {
  init: (options: {
    apiKey: string;
    baseUrl?: string;
    theme?: string | Partial<ChatTheme>;
    position?: 'bottom-right' | 'bottom-left';
  }) => CrewFormChatWidget;
  _instance?: CrewFormChatWidget;
}

const CrewFormChat: CrewFormChatGlobal = {
  init(options) {
    // Destroy existing instance if present
    if (CrewFormChat._instance) {
      CrewFormChat._instance.destroy();
    }

    CrewFormChat._instance = new CrewFormChatWidget(options);
    return CrewFormChat._instance;
  },
};

// Expose global
(window as unknown as Record<string, unknown>).CrewFormChat = CrewFormChat;

// Auto-init from script tag data attributes
function autoInit() {
  const script = document.currentScript
    ?? document.querySelector('script[data-key^="cf_chat_"]');

  if (!script) return;

  const apiKey = script.getAttribute('data-key');
  if (!apiKey) return;

  const theme = script.getAttribute('data-theme') ?? undefined;
  const position = script.getAttribute('data-position') as 'bottom-right' | 'bottom-left' | null ?? undefined;
  const baseUrl = script.getAttribute('data-url') ?? undefined;

  CrewFormChat.init({
    apiKey,
    baseUrl,
    theme,
    position: position ?? undefined,
  });
}

// Run auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoInit);
} else {
  autoInit();
}

export default CrewFormChat;
