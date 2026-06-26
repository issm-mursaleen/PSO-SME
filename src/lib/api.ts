// Frontend → backend client. Base URL mirrors the c360 convention.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface ChatAction {
  workflow: string;
  params: Record<string, unknown>;
}

export interface ChatResponse {
  text: string;
  card_type?: 'metric' | 'confirmation' | 'invoice' | 'sale_confirmation' | 'customer_confirmation' | null;
  card_data?: Record<string, unknown> | null;
  action?: ChatAction | null;
  source: 'llm' | 'fallback';
}

/** A customer row sent so the backend can resolve names against the live roster. */
export interface ChatCustomerCtx {
  id: string;
  name: string;
  phone?: string;
  balance: number;
  creditLimit: number;
  lastVisitDays: number;
}

export interface ChatContext {
  active_customer_id?: string | null;
  current_page?: string;
  customers?: ChatCustomerCtx[];
}

/** One prior turn of the conversation, sent so the agent remembers earlier chats. */
export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** POST a message to the deterministic-workflow chat backend. Throws on
 * network/HTTP failure so callers can fall back to local handling. */
export async function sendChatToBackend(
  message: string,
  context: ChatContext = {},
  history: ChatHistoryMessage[] = [],
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context, history }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}`);
  return res.json();
}

export async function transcribeAudio(audio: Blob): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'audio/webm' },
    body: audio,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `transcribe ${res.status}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text?.trim() ?? '';
}
