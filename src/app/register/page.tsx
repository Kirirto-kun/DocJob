'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { MedizoAiLogo } from '@/components/icons';
import { registerUser } from '@/app/actions';
import { signInWithCredentials } from '@/hooks/use-user-store';
import { SUBGROUPS } from '@/lib/case-taxonomy';

const REGIONS = [
  'Москва',
  'Санкт-Петербург',
  'Новосибирск',
  'Екатеринбург',
  'Казань',
  'Нижний Новгород',
  'Челябинск',
  'Самара',
  'Омск',
  'Ростов-на-Дону',
  'Уфа',
  'Красноярск',
  'Воронеж',
  'Пермь',
  'Волгоград',
  'Другой',
];

const clinicalSpecialties = SUBGROUPS.find((s) => s.slug === 'clinical')?.specialties ?? [];
const SPECIALTIES = Array.from(new Set([...clinicalSpecialties, 'Другое']));

const registerSchema = z.object({
  fullName: z.string().min(2, 'Укажите ФИО (минимум 2 символа)'),
  region: z.string().min(1, 'Выберите регион'),
  age: z.coerce
    .number({ invalid_type_error: 'Возраст должен быть числом' })
    .int('Возраст должен быть целым числом')
    .min(16, 'Минимальный возраст — 16')
    .max(100, 'Максимальный возраст — 100'),
  specialty: z.string().min(1, 'Выберите специальность'),
  email: z.string().email('Введите корректный email'),
  phoneNumber: z
    .string()
    .min(7, 'Введите корректный номер телефона')
    .regex(/^[\d +\-()]+$/, 'Допустимы только цифры, пробелы и символы + - ( )'),
  password: z.string().min(6, 'Пароль должен содержать минимум 6 символов'),
  consentAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Требуется ваше согласие' }),
  }),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

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
          title: 'Ошибка регистрации',
          description: result.error,
        });
        return;
      }

      const signIn = await signInWithCredentials(data.email, data.password);
      if (!signIn.ok) {
        toast({
          variant: 'destructive',
          title: 'Не удалось войти',
          description: signIn.error ?? 'Попробуйте войти вручную.',
        });
        router.push('/login');
        return;
      }

      toast({ title: 'Регистрация успешна' });
      router.push('/select-subgroup');
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <MedizoAiLogo className="h-16 w-16" />
          </div>
          <CardTitle className="text-2xl font-headline">Регистрация в Medizo AI</CardTitle>
          <CardDescription>Заполните данные, чтобы создать аккаунт</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">ФИО</Label>
              <Input id="fullName" {...register('fullName')} />
              {errors.fullName && (
                <p className="text-sm text-destructive">{errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="region">Регион</Label>
              <Select
                value={regionValue || undefined}
                onValueChange={(value) => setValue('region', value, { shouldValidate: true })}
              >
                <SelectTrigger id="region">
                  <SelectValue placeholder="Выберите регион" />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.region && (
                <p className="text-sm text-destructive">{errors.region.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="age">Возраст</Label>
              <Input id="age" type="number" inputMode="numeric" {...register('age')} />
              {errors.age && <p className="text-sm text-destructive">{errors.age.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="specialty">Специальность</Label>
              <Select
                value={specialtyValue || undefined}
                onValueChange={(value) => setValue('specialty', value, { shouldValidate: true })}
              >
                <SelectTrigger id="specialty">
                  <SelectValue placeholder="Выберите специальность" />
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
              <Label htmlFor="email">Почта</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Номер телефона</Label>
              <Input id="phoneNumber" type="tel" {...register('phoneNumber')} />
              {errors.phoneNumber && (
                <p className="text-sm text-destructive">{errors.phoneNumber.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
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
                Я ознакомлен с Пользовательским соглашением, документом об использовании
                персональных данных и договором публичной оферты
              </Label>
            </div>
            {errors.consentAccepted && (
              <p className="text-sm text-destructive">
                {errors.consentAccepted.message ?? 'Требуется ваше согласие'}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={!isValid || isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Зарегистрироваться
            </Button>
          </form>

          <div className="mt-4 text-center text-sm">
            <span className="text-muted-foreground">Уже есть аккаунт? </span>
            <Link href="/login" className="text-primary hover:underline">
              Войти
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
