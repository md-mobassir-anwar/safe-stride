import { Shield, AlertTriangle } from 'lucide-react';

export function Logo({ size = 'md', showText = true }: { size?: 'sm' | 'md' | 'lg'; showText?: boolean }) {
  const sizes = {
    sm: { icon: 20, text: 'text-lg' },
    md: { icon: 28, text: 'text-xl' },
    lg: { icon: 40, text: 'text-2xl' },
  };
  const s = sizes[size];
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div className="absolute inset-0 bg-brand-600 rounded-lg blur-md opacity-30" />
        <div className="relative bg-gradient-to-br from-brand-600 to-brand-800 rounded-lg flex items-center justify-center">
          <Shield size={s.icon} className="text-white p-1" />
        </div>
      </div>
      {showText && (
        <span className={`font-bold ${s.text} text-brand-700 dark:text-brand-200`}>
          Safe<span className="text-teal-accent-500">Stride</span>
        </span>
      )}
    </div>
  );
}

export function Disclaimer() {
  return (
    <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-warning-500" />
      <p>
        SafeStride supports, and does not replace, emergency services. In a life-threatening situation, call <strong>112</strong> immediately.
      </p>
    </div>
  );
}

export function LoadingSpinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="w-8 h-8 border-3 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <div className="w-16 h-16 bg-brand-50 dark:bg-brand-900/30 rounded-full flex items-center justify-center">
        <Icon size={28} className="text-brand-400" />
      </div>
      <p className="font-semibold text-gray-700 dark:text-gray-200">{title}</p>
      {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">{subtitle}</p>}
    </div>
  );
}

export function BadgeIcon({ badge }: { badge: 'bronze' | 'silver' | 'gold' }) {
  const classes = {
    gold: 'badge-gold',
    silver: 'badge-silver',
    bronze: 'badge-bronze',
  };
  const labels = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
  return <span className={`badge ${classes[badge]}`}>{labels[badge]}</span>;
}

export function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="text-amber-500" style={{ fontSize: size }}>★</span>
      <span className="font-semibold text-sm" style={{ fontSize: size * 0.9 }}>{rating.toFixed(1)}</span>
    </div>
  );
}
