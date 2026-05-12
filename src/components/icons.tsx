import Image from 'next/image';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

type DocJobLogoProps = Omit<ComponentProps<typeof Image>, 'src' | 'alt' | 'width' | 'height'>;

export const DocJobLogo = ({ className, ...props }: DocJobLogoProps) => (
    <Image
        src="/logo_dj.jpg"
        alt="MEDIZO"
        width={64}
        height={64}
        priority
        className={cn('object-contain', className)}
        {...props}
    />
);

export const MedizoAiLogo = DocJobLogo;
