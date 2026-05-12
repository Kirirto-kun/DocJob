import Image from 'next/image';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

type DocJobLogoProps = Omit<ComponentProps<typeof Image>, 'src' | 'alt' | 'width' | 'height'>;

export const DocJobLogo = ({ className, ...props }: DocJobLogoProps) => (
    <Image
        src="/logo_dj.jpg"
        alt="MEDIZO"
        width={128}
        height={128}
        priority
        className={cn('rounded-full bg-white object-cover', className)}
        {...props}
    />
);

export const MedizoAiLogo = DocJobLogo;
