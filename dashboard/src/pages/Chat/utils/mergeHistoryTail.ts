import type { ChatMessage } from "../hooks/sseHelpers";

function lastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return -1;
}

/** Local turn still on screen: from the latest user message through the end. */
function inFlightTail(current: ChatMessage[]): ChatMessage[] {
  const idx = lastUserIndex(current);
  if (idx < 0) return current;
  return current.slice(idx);
}

/** Index of a user message in `tail` whose id the server page does not have. */
function newSendIndex(tail: ChatMessage[], loadedIds: Set<string>): number {
  return tail.findIndex(
    (message) => message.role === "user" && !loadedIds.has(message.id),
  );
}

/**
 * Apply a server history page without dropping a turn the user just sent.
 *
 * The dashboard send stores the optimistic user id on the checkpoint
 * HumanMessage. A finished turn therefore shares that id with the server
 * page, and the local bubbles are dropped once the reply is there too.
 * A later send keeps its own id until that row is stored.
 *
 * Opening an old thread fetches history before the optimistic bubble exists.
 * The response then replaces the list and the bubble vanishes, while the
 * WebSocket turn keeps running. Messages after the last shared id are that
 * local turn and stay on screen until the server page already includes them.
 */
export function mergeHistoryWithLocalTail(
  loaded: ChatMessage[],
  current: ChatMessage[],
): ChatMessage[] {
  if (current.length === 0) return loaded;
  if (loaded.length === 0) return current;

  const loadedIds = new Set(loaded.map((message) => message.id));
  const firstOverlap = current.findIndex((message) =>
    loadedIds.has(message.id),
  );

  if (firstOverlap < 0) {
    // This page does not contain the optimistic user id, so the turn is not
    // stored here yet.
    return [...loaded, ...inFlightTail(current)];
  }

  let lastOverlap = firstOverlap;
  for (let i = current.length - 1; i >= 0; i--) {
    if (loadedIds.has(current[i].id)) {
      lastOverlap = i;
      break;
    }
  }

  const olderPrefix = current.slice(0, firstOverlap);
  const localTail = current.slice(lastOverlap + 1);
  const base = [...olderPrefix, ...loaded];
  if (localTail.length === 0) return base;

  const freshSend = newSendIndex(localTail, loadedIds);
  if (freshSend >= 0) return [...base, ...localTail.slice(freshSend)];

  const overlapId = current[lastOverlap].id;
  const loadedOverlap = loaded.findIndex((message) => message.id === overlapId);
  const serverAfter = loadedOverlap >= 0 ? loaded.slice(loadedOverlap + 1) : [];
  // User row is stored and the reply is not in this page yet.
  if (serverAfter.length === 0) return [...base, ...localTail];
  return base;
}
