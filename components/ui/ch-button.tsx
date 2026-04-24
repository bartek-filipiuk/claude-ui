import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'outline' | 'primary' | 'secondary' | 'on';
type Size = 'default' | 'sm' | 'icon';

export interface CHButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const CHButton = forwardRef<HTMLButtonElement, CHButtonProps>(
  ({ className, variant = 'default', size = 'default', type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'ch-btn',
        variant !== 'default' && variant,
        size === 'sm' && 'sm',
        size === 'icon' && 'icon',
        className,
      )}
      {...rest}
    />
  ),
);
CHButton.displayName = 'CHButton';
