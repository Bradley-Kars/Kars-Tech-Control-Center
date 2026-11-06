import { EmbeddedTerminal } from '../components/terminal/EmbeddedTerminal';
import { Button } from '../components/ui/Button';

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
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--kts-border-default)] bg-[var(--kts-bg-secondary)]">
        <Button variant="primary" size="sm">Connect</Button>
        <Button variant="ghost" size="sm">Start Hermes</Button>
      </div>
      <EmbeddedTerminal profile="opencode" />
    </div>
  );
}
