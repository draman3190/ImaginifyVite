interface StatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: 'bg-green-500/15 text-green-400 border border-green-500/30',
  PROCESSING: 'bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse-glow',
  PENDING_UPLOAD: 'bg-cosmic-500/15 text-cosmic-400 border border-cosmic-500/30',
  FAILED: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] || 'bg-raised/50 text-text-muted border border-border-subtle';
  const label = status.replace(/_/g, ' ');

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
