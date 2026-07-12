import Image from 'next/image';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

type DocJobLogoProps = Omit<ComponentProps<typeof Image>, 'src' | 'alt' | 'width' | 'height'>;

export const DocJobLogo = ({ className, ...props }: DocJobLogoProps) => (
    <Image
        src="/logo_dj.jpg?v=20260602"
        alt="DocJob"
        width={128}
        height={128}
        unoptimized
        priority
        className={cn('rounded-full bg-background object-cover', className)}
        {...props}
    />
);
