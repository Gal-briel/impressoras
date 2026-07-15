function sanitizeIdempotencyPart(value: string | undefined | null) {
  return String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';
}

function randomIdempotencySuffix() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}

export function createIdempotencyKey(prefix = 'web') {
  return `${sanitizeIdempotencyPart(prefix)}-${randomIdempotencySuffix()}`;
}

export function createCommandIdempotencyKey(
  commandType: string,
  agentId?: string,
  scope = 'command',
) {
  const parts = [
    sanitizeIdempotencyPart(scope),
    sanitizeIdempotencyPart(commandType),
  ];

  if (agentId) {
    parts.push(sanitizeIdempotencyPart(agentId));
  }

  return `${parts.join('-')}-${randomIdempotencySuffix()}`;
}
