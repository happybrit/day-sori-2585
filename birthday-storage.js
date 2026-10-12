/* Persistent birthday submissions with an offline retry queue.
 * The public Supabase key is intentionally used only with insert-only RLS.
 * This is not identity verification: do not claim a record is authenticated as Sori.
 */
(function () {
  'use strict';

  const config = window.BIRTHDAY_DB || {};
  const url = String(config.url || '').trim().replace(/\/$/, '');
  const key = String(config.publishableKey || '').trim();
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) &&
    (/^sb_publishable_/i.test(key) || /^eyJ/.test(key));
  const STORAGE_KEY = 'bd_pending_events_v1';
  const TYPES = new Set(['wish', 'quiz_answer', 'emoji_answer', 'math_answer',
    'color_answer', 'game_result', 'sudoku_result']);
  let memoryQueue = [];
  let ongoing = null;

  function loadQueue() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) return memoryQueue;
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : memoryQueue;
    } catch (_) {
      return memoryQueue;
    }
  }

  function writeQueue(queue) {
    memoryQueue = queue;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch (_) {
      // In private browsing, retry may only last as long as this page is open.
    }
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    if (window.crypto && crypto.getRandomValues) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      return Array.from(bytes, (b, i) => (i === 4 || i === 6 || i === 8 || i === 10 ? '-' : '') +
        b.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('Secure random IDs are unavailable');
  }

  async function flush() {
    if (!configured) return false;
    if (ongoing) return ongoing;
    ongoing = (async () => {
      while (loadQueue().length) {
        const event = loadQueue()[0];
        try {
          const response = await fetch(url + '/rest/v1/birthday_entries?on_conflict=client_event_id', {
            method: 'POST',
            headers: {
              apikey: key,
              'Content-Type': 'application/json',
              Prefer: 'resolution=ignore-duplicates,return=minimal'
            },
            body: JSON.stringify(event)
          });
          if (!response.ok) {
            console.warn('Birthday DB returned HTTP ' + response.status);
            return false;
          }
          // Remove by ID, not position: a new event may have been queued meanwhile.
          writeQueue(loadQueue().filter(item => item.client_event_id !== event.client_event_id));
        } catch (_) {
          // Keep the unsent event and retry on the next visit/online event.
          return false;
        }
      }
      return true;
    })();
    try { return await ongoing; }
    finally { ongoing = null; }
  }

  async function save(type, text, details) {
    if (!TYPES.has(type)) return false;
    const content = String(text || '').trim().slice(0, 500);
    if (!content) return false;
    let event;
    try {
      event = {
        client_event_id: uuid(),
        event_type: type,
        content,
        details: details && typeof details === 'object' && !Array.isArray(details) ? details : {}
      };
    } catch (_) {
      return false;
    }
    writeQueue([...loadQueue(), event]);
    await flush();
    return !loadQueue().some(item => item.client_event_id === event.client_event_id);
  }

  window.BirthdayStorage = { configured, save, flush, pendingCount: () => loadQueue().length };
  window.addEventListener('online', () => { void flush(); });
  setTimeout(() => { void flush(); }, 800);
})();
