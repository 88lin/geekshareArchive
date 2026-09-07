UPDATE webhook_updates
SET status = 'ignored',
    processed_at = COALESCE(processed_at, CURRENT_TIMESTAMP)
WHERE status = 'failed'
  AND error = 'Reaction target message was not found';
