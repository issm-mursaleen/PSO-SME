import * as React from 'react';
import { cn } from './cn';

type Variant = 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive' | 'link';
type Size = 'sm' | 'default' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/85',
  outline: 'border border-outline-variant bg-card text-foreground hover:bg-muted',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  secondary: 'bg-muted text-foreground hover:bg-surface-container-high',
  destructive: 'bg-danger/10 text-danger hover:bg-danger/20',
  link: 'text-foreground underline-offset-4 hover:underline',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 gap-1 px-2.5 text-xs rounded-lg',
  default: 'h-8 gap-1.5 px-3 text-xs rounded-lg',
  lg: 'h-9 gap-2 px-4 text-sm rounded-lg',
  icon: 'size-8 rounded-lg',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-all outline-none select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-3.5',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
