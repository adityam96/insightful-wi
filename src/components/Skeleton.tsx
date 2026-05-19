interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = '', style }: SkeletonProps) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-card border border-border p-5 space-y-3" style={{ minWidth: 220 }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="w-16 h-3.5" />
            <Skeleton className="w-12 h-3" />
          </div>
        </div>
        <Skeleton className="w-20 h-5 rounded-badge" />
      </div>
      <Skeleton className="w-full h-4" />
      <Skeleton className="w-3/4 h-4" />
      <Skeleton className="w-1/2 h-3" />
    </div>
  );
}

export function SkeletonStatBox() {
  return (
    <div className="bg-white rounded-card border border-border p-5">
      <Skeleton className="w-24 h-3 mb-3" />
      <Skeleton className="w-16 h-8 mb-2" />
      <Skeleton className="w-20 h-3" />
    </div>
  );
}
