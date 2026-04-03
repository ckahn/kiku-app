type BadgeVariant = 'info' | 'warning' | 'success' | 'error' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  info:    'bg-info-subtle text-info-on-subtle',
  warning: 'bg-warning-subtle text-warning-on-subtle',
  success: 'bg-success-subtle text-success-on-subtle',
  error:   'bg-error-subtle text-error-on-subtle',
  neutral: 'bg-canvas text-muted border border-border',
};

export default function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
