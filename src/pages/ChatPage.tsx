import { ChatPanel } from '../components/opencode/ChatPanel';

export function ChatPage() {
  return (
    <div
      className="flex flex-col rounded-[var(--kts-radius-md)] overflow-hidden"
      style={{
        border: '1px solid var(--kts-border-default)',
        height: 'calc(100vh - 140px)',
      }}
    >
      <ChatPanel />
    </div>
  );
}
