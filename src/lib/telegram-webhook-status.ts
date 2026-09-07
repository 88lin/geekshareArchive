export type TelegramWebhookHealth = {
  pending_update_count?: number;
  last_error_message?: string;
};

export function activeTelegramWebhookError(
  webhook: TelegramWebhookHealth | null | undefined,
): string | null {
  const message = webhook?.last_error_message?.trim();
  if (!message || webhook?.pending_update_count === 0) return null;
  return message;
}
