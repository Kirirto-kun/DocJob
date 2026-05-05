'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { DocJobLogo } from '@/components/icons';
import { LanguageSwitcher } from '@/components/language-switcher';
import { registerUser } from '@/app/actions';
import { signInWithCredentials } from '@/hooks/use-user-store';
import { SUBGROUPS } from '@/lib/case-taxonomy';

const REGION_KEYS = [
  'moscow',
  'spb',
  'novosibirsk',
  'ekaterinburg',
  'kazan',
  'nizhnyNovgorod',
  'chelyabinsk',
  'samara',
  'omsk',
  'rostov',
  'ufa',
  'krasnoyarsk',
  'voronezh',
  'perm',
  'volgograd',
  'other',
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('auth.register');
  const [isLoading, setIsLoading] = useState(false);

  const SPECIALTIES = useMemo(() => {
    const clinicalSpecialties = SUBGROUPS.find((s) => s.slug === 'clinical')?.specialties ?? [];
    return Array.from(new Set([...clinicalSpecialties, t('specialtyOther')]));
  }, [t]);

  const REGIONS = useMemo(
    () => REGION_KEYS.map((k) => ({ key: k, label: t(`regions.${k}`) })),
    [t],
  );

  const registerSchema = useMemo(
    () =>
      z.object({
        fullName: z.string().min(2, t('errors.fullNameMin')),
        region: z.string().min(1, t('errors.regionRequired')),
        age: z.coerce
          .number({ invalid_type_error: t('errors.ageNumber') })
          .int(t('errors.ageInt'))
          .min(16, t('errors.ageMin'))
          .max(100, t('errors.ageMax')),
        specialty: z.string().min(1, t('errors.specialtyRequired')),
        email: z.string().email(t('errors.emailInvalid')),
        phoneNumber: z
          .string()
          .min(7, t('errors.phoneMin'))
          .regex(/^[\d +\-()]+$/, t('errors.phoneFormat')),
        password: z.string().min(6, t('errors.passwordMin')),
        consentAccepted: z.literal(true, {
          errorMap: () => ({ message: t('errors.consentRequired') }),
        }),
      }),
    [t],
  );
  type RegisterFormValues = z.infer<typeof registerSchema>;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange',
    defaultValues: {
      fullName: '',
      region: '',
      specialty: '',
      email: '',
      phoneNumber: '',
      password: '',
      consentAccepted: undefined,
    },
  });

  const regionValue = watch('region');
  const specialtyValue = watch('specialty');
  const consentValue = watch('consentAccepted');

  const onSubmit: SubmitHandler<RegisterFormValues> = async (data) => {
    setIsLoading(true);
    try {
      const result = await registerUser({
        email: data.email,
        password: data.password,
        name: data.fullName,
        fullName: data.fullName,
        region: data.region,
        age: data.age,
        specialty: data.specialty,
        phoneNumber: data.phoneNumber,
        consentAccepted: data.consentAccepted,
        role: 'DOCTOR',
      });

      if (!result.success) {
        toast({
          variant: 'destructive',
          title: t('toast.errorTitle'),
          description: result.error,
        });
        return;
      }

      const signIn = await signInWithCredentials(data.email, data.password);
      if (!signIn.ok) {
        toast({
          variant: 'destructive',
          title: t('toast.signInFailedTitle'),
          description: signIn.error ?? t('toast.signInFailedDescription'),
        });
        router.push('/login');
        return;
      }

      toast({ title: t('toast.successTitle') });
      router.push('/select-subgroup');
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-background p-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher variant="outline" />
      </div>
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <DocJobLogo className="h-16 w-16" />
          </div>
          <CardTitle className="text-2xl font-headline">{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t('fullNameLabel')}</Label>
              <Input id="fullName" {...register('fullName')} />
              {errors.fullName && (
                <p className="text-sm text-destructive">{errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="region">{t('regionLabel')}</Label>
              <Select
                value={regionValue || undefined}
                onValueChange={(value) => setValue('region', value, { shouldValidate: true })}
              >
                <SelectTrigger id="region">
                  <SelectValue placeholder={t('regionPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map((r) => (
                    <SelectItem key={r.key} value={r.label}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.region && (
                <p className="text-sm text-destructive">{errors.region.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="age">{t('ageLabel')}</Label>
              <Input id="age" type="number" inputMode="numeric" {...register('age')} />
              {errors.age && <p className="text-sm text-destructive">{errors.age.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="specialty">{t('specialtyLabel')}</Label>
              <Select
                value={specialtyValue || undefined}
                onValueChange={(value) => setValue('specialty', value, { shouldValidate: true })}
              >
                <SelectTrigger id="specialty">
                  <SelectValue placeholder={t('specialtyPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {SPECIALTIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.specialty && (
                <p className="text-sm text-destructive">{errors.specialty.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t('emailLabel')}</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">{t('phoneLabel')}</Label>
              <Input id="phoneNumber" type="tel" {...register('phoneNumber')} />
              {errors.phoneNumber && (
                <p className="text-sm text-destructive">{errors.phoneNumber.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('passwordLabel')}</Label>
              <Input id="password" type="password" {...register('password')} />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="flex items-start gap-2 pt-2">
              <Checkbox
                id="consentAccepted"
                checked={consentValue === true}
                onCheckedChange={(checked) => {
                  const next = checked === true;
                  setValue('consentAccepted', next as true, { shouldValidate: true });
                }}
              />
              <Label
                htmlFor="consentAccepted"
                className="text-sm font-normal leading-snug text-muted-foreground"
              >
                {t.rich('consentLabel', {
                  terms: (chunks) => (
                    <Link
                      href="/legal/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {chunks}
                    </Link>
                  ),
                  privacy: (chunks) => (
                    <Link
                      href="/legal/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </Label>
            </div>
            {errors.consentAccepted && (
              <p className="text-sm text-destructive">
                {errors.consentAccepted.message ?? t('errors.consentRequired')}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={!isValid || isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('submit')}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm">
            <span className="text-muted-foreground">{t('haveAccount')} </span>
            <Link href="/login" className="text-primary hover:underline">
              {t('loginCta')}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
