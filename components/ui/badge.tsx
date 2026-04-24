import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'gold' | 'emerald' | 'red' | 'sky';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ variant = 'default', className, ...rest }: BadgeProps) {
  return <span className={cn('badge', variant !== 'default' && variant, className)} {...rest} />;
}
