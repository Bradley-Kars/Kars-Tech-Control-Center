import { EmbeddedTerminal } from '../components/terminal/EmbeddedTerminal';

export function ChatPage() {
  return (
    <div
      data-testid="chat-page"
      className="flex flex-col rounded-[var(--kts-radius-md)] overflow-hidden"
      style={{
        border: '1px solid var(--kts-border-default)',
        height: 'calc(100vh - 140px)',
      }}
    >
      <EmbeddedTerminal profile="opencode" />
    </div>
  );
}
