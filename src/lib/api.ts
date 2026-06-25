// Frontend → backend client. Base URL mirrors the c360 convention.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface ChatAction {
  workflow: string;
  params: Record<string, unknown>;
}

export interface ChatResponse {
  text: string;
  card_type?: 'metric' | 'confirmation' | 'invoice' | null;
  card_data?: Record<string, unknown> | null;
  action?: ChatAction | null;
  source: 'llm' | 'fallback';
}

export interface ChatContext {
  active_customer_id?: string | null;
  current_page?: string;
}

/** POST a message to the deterministic-workflow chat backend. Throws on
 * network/HTTP failure so callers can fall back to local handling. */
export async function sendChatToBackend(
  message: string,
  context: ChatContext = {},
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}`);
  return res.json();
}
