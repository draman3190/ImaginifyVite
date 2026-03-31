interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="w-full">
      <div className="relative h-6 w-full overflow-hidden rounded-full bg-deep border border-border-subtle">
        {/* Progress fill with cosmic purple to ethereal gold gradient */}
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${percentage}%`,
            background: 'linear-gradient(90deg, #8b5cf6 0%, #a78bfa 40%, #f59e0b 100%)',
          }}
        />
        {/* Percentage text centered - always readable with text shadow */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-xs font-bold text-white"
            style={{
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.8), 0 0 4px rgba(0, 0, 0, 0.5)',
            }}
          >
            {percentage}%
          </span>
        </div>
      </div>
      <p className="mt-1 text-center text-xs text-text-muted">
        {current} of {total} chapters processed
      </p>
    </div>
  );
}
