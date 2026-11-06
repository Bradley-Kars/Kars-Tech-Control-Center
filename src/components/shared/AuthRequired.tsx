import { Card, CardSection } from '../ui/Card';

export function AuthRequired() {
  return (
    <Card variant="red" className="mt-6">
      <CardSection title="Not signed in">
        <p className="text-sm text-muted mt-1">
          Open this app through the tailnet URL (kars-tech-solutions.tailf6d3b4.ts.net), or add an API token in Settings.
        </p>
        <div className="px-4 py-4 flex justify-end">
          <a href="/settings" className="underline underline-offset-4 text-xs text-[var(--kts-text-primary)] hover:text-[var(--kts-brand-primary)]">
            Open Settings
          </a>
        </div>
      </CardSection>
    </Card>
  );
}
