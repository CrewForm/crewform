// ─── Chat Widget API Client ─────────────────────────────────────────────────

export interface WidgetConfig {
  widgetId: string;
  agentName: string;
  agentDescription: string;
  welcomeMessage: string;
  placeholderText: string;
  theme: Record<string, unknown>;
}

export interface ChatMessageData {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export type StreamCallback = (event: { type: string; content: string }) => void;

export class ChatApi {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /** Fetch widget configuration */
  async getConfig(): Promise<WidgetConfig> {
    const res = await fetch(`${this.baseUrl}/chat/config`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      throw new Error(`Config fetch failed: ${res.status}`);
    }

    return res.json() as Promise<WidgetConfig>;
  }

  /** Fetch message history for a visitor */
  async getHistory(visitorId: string): Promise<ChatMessageData[]> {
    const res = await fetch(
      `${this.baseUrl}/chat/history?visitorId=${encodeURIComponent(visitorId)}`,
      { headers: this.headers() },
    );

    if (!res.ok) return [];

    const data = await res.json() as { messages: ChatMessageData[] };
    return data.messages ?? [];
  }

  /** Send a message and receive streaming response via SSE */
  async sendMessage(
    message: string,
    visitorId: string,
    onEvent: StreamCallback,
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/chat/message`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ message, visitorId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' })) as { error: string };
      onEvent({ type: 'error', content: err.error ?? `Error ${res.status}` });
      return;
    }

    if (!res.body) {
      onEvent({ type: 'error', content: 'No response body' });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6)) as { type: string; content: string };
            onEvent(event);

            if (event.type === 'done' || event.type === 'error') return;
          } catch {
            // Skip malformed events
          }
        }
      }
    }
  }
}
