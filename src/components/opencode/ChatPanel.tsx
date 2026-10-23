import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, IconButton } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  opencodeStart,
  opencodeStop,
  opencodeStatus,
  opencodeNewSession,
  opencodeSendMessage,
  opencodeGetHistory,
  opencodeAbort,
} from '../../lib/tauri-commands';
import type { ChatMessage, OpencodeStatus } from '../../lib/types';

interface ChatPanelProps {
  /** Optional: mount inside a fixed drawer rather than as a page */
  onClose?: () => void;
}

export function ChatPanel({ onClose }: ChatPanelProps) {
  const [status, setStatus] = useState<OpencodeStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check status on mount
  useEffect(() => {
    void opencodeStatus().then(setStatus).catch(() => setStatus({ running: false, port: null, pid: null }));
  }, []);

  const handleStart = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const st = await opencodeStart();
      setStatus(st);
      const sid = await opencodeNewSession();
      setSessionId(sid);
      setMessages([{ role: 'system', text: 'Connected to Hermes. Ask me anything about your fleet.' }]);
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  }, []);

  const handleStop = useCallback(async () => {
    try {
      await opencodeStop();
      setStatus({ running: false, port: null, pid: null });
      setSessionId(null);
      setMessages([]);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !sessionId || busy) return;
    const userMsg = input.trim();
    setInput('');
    setBusy(true);
    setError(null);
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);

    try {
      const replies = await opencodeSendMessage(sessionId, userMsg);
      if (replies.length > 0) {
        setMessages(prev => [...prev, ...replies]);
      } else {
        // Fallback: fetch history if response shape unexpected
        try {
          const history = await opencodeGetHistory(sessionId);
          setMessages(history);
        } catch { /* keep user msg */ }
      }
    } catch (e) {
      setError(String(e));
      setMessages(prev => [...prev, { role: 'system', text: `Error: ${e}` }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [input, sessionId, busy]);

  const handleAbort = useCallback(async () => {
    if (!sessionId) return;
    try {
      await opencodeAbort(sessionId);
      setBusy(false);
    } catch { /* ignore */ }
  }, [sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const running = status?.running ?? false;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--kts-bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--kts-border-default)' }}
      >
        <div className="flex items-center gap-3">
          <span style={{ color: 'var(--kts-text-primary)', fontWeight: 600 }}>
            Hermes Chat
          </span>
          <Badge variant={running ? 'success' : 'default'}>
            {running ? 'Connected' : 'Offline'}
          </Badge>
          {status?.port && (
            <span className="text-xs" style={{ color: 'var(--kts-text-secondary)' }}>
              port {status.port}
              {status.pid ? ` · pid ${status.pid}` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {running ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => void handleStop()}>
                Disconnect
              </Button>
              {onClose && (
                <IconButton aria-label="Close" size="sm" onClick={onClose}>
                  ✕
                </IconButton>
              )}
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={() => void handleStart()} disabled={starting}>
              {starting ? 'Starting…' : 'Connect'}
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!running && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center" style={{ color: 'var(--kts-text-secondary)' }}>
            <p className="text-lg mb-2">Hermes is not connected</p>
            <p className="text-sm mb-4">Start the sidecar to chat with your AI assistant</p>
            <Button variant="primary" onClick={() => void handleStart()} disabled={starting}>
              {starting ? 'Starting…' : 'Start Hermes'}
            </Button>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--kts-text-secondary)' }}>
            <div className="animate-pulse">●</div>
            <span>Hermes is thinking…</span>
            <Button variant="ghost" size="sm" onClick={() => void handleAbort()}>
              Stop
            </Button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error bar */}
      {error && (
        <div
          className="px-4 py-2 text-sm"
          style={{ background: 'var(--kts-color-danger-bg, #fee2e2)', color: 'var(--kts-color-danger, #dc2626)' }}
        >
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {/* Input */}
      {running && (
        <div
          className="flex items-end gap-2 p-3"
          style={{ borderTop: '1px solid var(--kts-border-default)' }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Hermes… (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 resize-none rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: 'var(--kts-bg-secondary)',
              color: 'var(--kts-text-primary)',
              border: '1px solid var(--kts-border-default)',
              minHeight: '40px',
              maxHeight: '120px',
            }}
            disabled={busy}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSend()}
            disabled={busy || !input.trim()}
          >
            {busy ? '…' : 'Send'}
          </Button>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';

  const bg = isUser
    ? 'var(--kts-color-accent-bg, #dbeafe)'
    : isSystem
    ? 'var(--kts-bg-tertiary, #f3f4f6)'
    : 'var(--kts-bg-secondary)';
  const color = isSystem ? 'var(--kts-text-secondary)' : 'var(--kts-text-primary)';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${isSystem ? 'italic' : ''}`}
        style={{ background: bg, color }}
      >
        {!isSystem && (
          <div className="text-xs font-semibold mb-1" style={{ opacity: 0.6 }}>
            {isUser ? 'You' : 'Hermes'}
          </div>
        )}
        {msg.text}
      </div>
    </div>
  );
}
