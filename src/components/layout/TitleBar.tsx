export function TitleBar() {
  return (
    <div data-tauri-drag-region className="flex items-center h-9 bg-panel border-b border-line select-none shrink-0">
      <div className="flex items-center gap-2.5 px-4">
        <div className="w-5 h-5 rounded bg-gradient-to-br from-teal to-teal-dim flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M3 12h4l2-7 4 14 2-7h6" stroke="#0A1628" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span className="text-xs font-heading font-semibold text-off tracking-tight">KTS Master Control</span>
      </div>
    </div>
  );
}
