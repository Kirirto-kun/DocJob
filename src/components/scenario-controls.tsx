
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { handleGenerateScenario, handleSimulateComorbidities, handleFileUpload } from '@/app/actions';
import {
  Loader2,
  BrainCircuit,
  HeartPulse,
  Baby,
  Upload,
  UserPlus,
  ListOrdered,
  UserRound,
  LifeBuoy,
  Newspaper,
  Phone,
  FilePlus2,
  LayoutGrid,
  Megaphone,
} from 'lucide-react';
import type { GeneratePersonalizedScenarioOutput } from '@/ai/flows/generate-personalized-scenario';
import UserSwitcher from './user-switcher';
import { useUserStore } from '@/hooks/use-user-store';
import { usePatientStore } from '@/hooks/use-patient-store';
import { Separator } from './ui/separator';

const scenarioSchema = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  specialty: z.string().min(1, 'Specialty is required'),
  performanceData: z.string().min(1, 'Performance data is required'),
  medicalRecords: z.string().optional(),
});

const comorbiditySchema = z.object({
  primaryCondition: z.string().min(1, 'Primary condition is required'),
  patientHistory: z.string().optional(),
});

type ScenarioFormValues = z.infer<typeof scenarioSchema>;
type ComorbidityFormValues = z.infer<typeof comorbiditySchema>;

type ScenarioControlsProps = {
    onScenarioGenerated: (scenario: GeneratePersonalizedScenarioOutput | null) => void;
};

const navButtonClass =
  'w-full border-primary/50 text-primary/80 hover:bg-primary/10 hover:text-primary';
const navWrapperClass =
  'p-2 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center';

export default function ScenarioControls({ onScenarioGenerated }: ScenarioControlsProps) {
  const { currentUser, updateUser, allUsers } = useUserStore();
  const { activePatient, updatePatient } = usePatientStore();
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations('nav');
  const [isScenarioLoading, setScenarioLoading] = useState(false);
  const [isComorbidityLoading, setComorbidityLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [comorbidityResult, setComorbidityResult] = useState<{ present: boolean, reasoning: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scenarioForm = useForm<ScenarioFormValues>({
    resolver: zodResolver(scenarioSchema),
    defaultValues: { studentId: '', specialty: '', performanceData: 'No significant issues on last simulation.', medicalRecords: '' },
  });

  const comorbidityForm = useForm<ComorbidityFormValues>({
    resolver: zodResolver(comorbiditySchema),
    defaultValues: { primaryCondition: 'Type 2 Diabetes', patientHistory: '55-year-old male with obesity.' },
  });

  useEffect(() => {
    if (currentUser?.role === 'doctor' && currentUser.specialty) {
      scenarioForm.setValue('studentId', currentUser.id);
      scenarioForm.setValue('specialty', currentUser.specialty);
    }
  }, [currentUser, scenarioForm]);

  useEffect(() => {
    if (activePatient) {
        const patientUser = allUsers.find(u => u.id === activePatient.id);
        const combinedRecords = [
            activePatient.history,
            patientUser?.medicalRecords
        ].filter(Boolean).join('\n\n--- UPLOADED RECORDS ---\n');
        scenarioForm.setValue('medicalRecords', combinedRecords);
    } else if (currentUser?.role === 'doctor') {
        scenarioForm.setValue('medicalRecords', '');
    }
  }, [activePatient, currentUser, allUsers, scenarioForm]);


  const onScenarioSubmit: SubmitHandler<ScenarioFormValues> = async (data) => {
    if (!activePatient) {
        toast({ variant: 'destructive', title: t('scenario.errorTitle'), description: t('scenario.errorActiveRequired') });
        return;
    }
    setScenarioLoading(true);
    const result = await handleGenerateScenario({
        ...data,
        datasetId: 'public-patient-data-v1'
    });
    setScenarioLoading(false);

    if (result.success) {
      toast({ title: t('scenario.successTitle'), description: t('scenario.successDescriptionFor', { name: activePatient.name }) });
      updatePatient({
        ...activePatient,
        scenario: {
          scenarioDescription: result.data.scenarioDescription,
          learningObjectives: result.data.learningObjectives,
          comorbidities: result.data.comorbidities ?? '',
        },
      });
      onScenarioGenerated(result.data);
    } else {
      toast({ variant: 'destructive', title: t('scenario.errorTitle'), description: result.error });
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    const result = await handleFileUpload(formData);
    setIsUploading(false);

    if (result.success) {
      toast({ title: t('scenario.uploadSuccessTitle'), description: t('scenario.uploadSuccessDescription', { name: file.name }) });
      const recordHeader = `--- UPLOADED BY PATIENT (${new Date().toLocaleDateString()}) ---\n`;
      const newRecords = recordHeader + result.data.recordContent;
      updateUser({ ...currentUser, medicalRecords: (currentUser.medicalRecords ? currentUser.medicalRecords + '\n\n' : '') + newRecords });
    } else {
      toast({ variant: 'destructive', title: t('scenario.uploadErrorTitle'), description: result.error });
    }
  };


  const onComorbiditySubmit: SubmitHandler<ComorbidityFormValues> = async (data) => {
    setComorbidityLoading(true);
    const result = await handleSimulateComorbidities(data);
    setComorbidityLoading(false);

    if (result.success) {
        setComorbidityResult({ present: result.data.presentComorbidities, reasoning: result.data.comorbiditiesReasoning});
    } else {
      toast({ variant: 'destructive', title: t('scenario.errorTitle'), description: result.error });
      setComorbidityResult(null);
    }
  };

  const specialtyIcon = (specialty: string) => {
    switch (specialty.toLowerCase()) {
        case 'cardiology': return <HeartPulse className="h-4 w-4" />;
        case 'neurology': return <BrainCircuit className="h-4 w-4" />;
        case 'pediatrics': return <Baby className="h-4 w-4" />;
        default: return null;
    }
  }

  if (!currentUser) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-2">
        <UserSwitcher />
      </div>
      <Separator className="my-2 bg-sidebar-border/50" />

      <div className={navWrapperClass}>
        <Button variant="outline" className={navButtonClass} onClick={() => router.push('/profile')}>
          <UserRound className="mr-2" />
          <span className="group-data-[collapsible=icon]:hidden">{t('profile')}</span>
        </Button>
      </div>
      <div className={navWrapperClass}>
        <Button variant="outline" className={navButtonClass} onClick={() => router.push('/support')}>
          <LifeBuoy className="mr-2" />
          <span className="group-data-[collapsible=icon]:hidden">{t('support')}</span>
        </Button>
      </div>
      <div className={navWrapperClass}>
        <Button variant="outline" className={navButtonClass} onClick={() => router.push('/news')}>
          <Newspaper className="mr-2" />
          <span className="group-data-[collapsible=icon]:hidden">{t('news')}</span>
        </Button>
      </div>
      <div className={navWrapperClass}>
        <Button variant="outline" className={navButtonClass} onClick={() => router.push('/contacts')}>
          <Phone className="mr-2" />
          <span className="group-data-[collapsible=icon]:hidden">{t('contacts')}</span>
        </Button>
      </div>
      <Separator className="my-2 bg-sidebar-border/50" />

       {currentUser.role === 'patient' && (
         <>
            <div className={navWrapperClass}>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".txt,.md,.pdf" />
                <Button variant="outline" className="w-full border-accent text-accent hover:bg-accent/10 hover:text-accent-foreground" onClick={handleFileSelect} disabled={isUploading}>
                {isUploading ? <Loader2 className="mr-2 animate-spin" /> : <Upload className="mr-2" />}
                <span className="group-data-[collapsible=icon]:hidden">{t('patient.uploadReport')}</span>
                </Button>
            </div>
            {currentUser.medicalRecords && (
                <div className="p-2 group-data-[collapsible=icon]:hidden">
                    <p className="text-xs text-muted-foreground truncate">{t('patient.recordsSaved')}</p>
                </div>
            )}
            <Separator className="my-2 bg-sidebar-border/50" />
         </>
       )}

      {currentUser.role === 'admin' && (
        <>
            <div className={navWrapperClass}>
                <Button variant="outline" className={navButtonClass} onClick={() => router.push('/add-doctor')}>
                    <UserPlus className="mr-2" />
                    <span className="group-data-[collapsible=icon]:hidden">{t('addDoctor')}</span>
                </Button>
            </div>
            <div className={navWrapperClass}>
                <Button variant="outline" className={navButtonClass} onClick={() => router.push('/new-case')}>
                    <FilePlus2 className="mr-2" />
                    <span className="group-data-[collapsible=icon]:hidden">{t('createCase')}</span>
                </Button>
            </div>
            <div className={navWrapperClass}>
                <Button variant="outline" className={navButtonClass} onClick={() => router.push('/admin/banners')}>
                    <Megaphone className="mr-2" />
                    <span className="group-data-[collapsible=icon]:hidden">{t('bannerAds')}</span>
                </Button>
            </div>
            <Separator className="my-2 bg-sidebar-border/50" />
        </>
      )}

      {currentUser.role === 'doctor' && (
        <>
            <div className={navWrapperClass}>
                <Button variant="outline" className={navButtonClass} onClick={() => router.push('/manage-patients')}>
                    <ListOrdered className="mr-2" />
                    <span className="group-data-[collapsible=icon]:hidden">{t('myCases')}</span>
                </Button>
            </div>
            <div className={navWrapperClass}>
                <Button variant="outline" className={navButtonClass} onClick={() => router.push('/select-subgroup')}>
                    <LayoutGrid className="mr-2" />
                    <span className="group-data-[collapsible=icon]:hidden">{t('subgroupCatalog')}</span>
                </Button>
            </div>
            <Separator className="my-2 bg-sidebar-border/50" />
        </>
      )}

      { currentUser.role !== 'patient' && (
        <Tabs defaultValue="scenario" className="w-full px-2 group-data-[collapsible=icon]:px-0 flex-1">
            <TabsList className="grid w-full grid-cols-2 group-data-[collapsible=icon]:hidden">
            <TabsTrigger value="scenario">{t('scenario.tab')}</TabsTrigger>
            <TabsTrigger value="comorbidity">{t('comorbidity.tab')}</TabsTrigger>
            </TabsList>
            <div className="w-full text-center p-2 group-data-[collapsible=icon]:block hidden">
                <p className="text-xs text-muted-foreground">{t('managementGroupShort')}</p>
            </div>
            <TabsContent value="scenario">
            <Card className="border-none shadow-none bg-transparent">
                <CardHeader className="px-2 group-data-[collapsible=icon]:hidden">
                <CardTitle>{t('scenario.cardTitle')}</CardTitle>
                <CardDescription>{t('scenario.cardDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-2">
                <form onSubmit={scenarioForm.handleSubmit(onScenarioSubmit)} className="space-y-4 group-data-[collapsible=icon]:hidden">
                    <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <Label htmlFor="studentId">{t('scenario.activeCaseLabel')}</Label>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm font-medium">{activePatient ? activePatient.name : t('scenario.activeCaseEmpty')}</p>
                    </div>
                    </div>
                    <div className="p-2 rounded-md bg-muted/50 border border-border/50">
                    <Label htmlFor="specialty">{t('scenario.doctorLabel')}</Label>
                    <div className="flex items-center gap-2 mt-1">
                        {specialtyIcon(currentUser?.specialty || '')}
                        <p className="text-sm font-medium">{currentUser?.name} ({currentUser?.specialty})</p>
                    </div>
                    </div>
                    <div>
                    <Label htmlFor="performanceData">{t('scenario.notesLabel')}</Label>
                    <Textarea id="performanceData" {...scenarioForm.register('performanceData')} disabled={!currentUser || !activePatient} />
                    </div>
                    <Button type="submit" className="w-full" disabled={isScenarioLoading || !currentUser || !activePatient}>
                    {isScenarioLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('scenario.submit')}
                    </Button>
                </form>
                 <div className="group-data-[collapsible=icon]:block hidden">
                    <Button onClick={() => scenarioForm.handleSubmit(onScenarioSubmit)()} className="w-full" size="icon" disabled={isScenarioLoading || !currentUser || !activePatient}>
                        {isScenarioLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "G"}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-1">{t('scenario.submitShort')}</p>
                </div>
                </CardContent>
            </Card>
            </TabsContent>
            <TabsContent value="comorbidity">
            <Card className="border-none shadow-none bg-transparent">
                <CardHeader className="px-2 group-data-[collapsible=icon]:hidden">
                <CardTitle>{t('comorbidity.cardTitle')}</CardTitle>
                <CardDescription>{t('comorbidity.cardDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-2">
                <form onSubmit={comorbidityForm.handleSubmit(onComorbiditySubmit)} className="space-y-4 group-data-[collapsible=icon]:hidden">
                    <div>
                    <Label htmlFor="primaryCondition">{t('comorbidity.primaryLabel')}</Label>
                    <Input id="primaryCondition" {...comorbidityForm.register('primaryCondition')} />
                    </div>
                    <div>
                    <Label htmlFor="patientHistory">{t('comorbidity.historyLabel')}</Label>
                    <Textarea id="patientHistory" {...comorbidityForm.register('patientHistory')} />
                    </div>
                    <Button type="submit" className="w-full" disabled={isComorbidityLoading}>
                    {isComorbidityLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('comorbidity.submit')}
                    </Button>
                </form>
                <div className="group-data-[collapsible=icon]:block hidden">
                    <Button onClick={() => comorbidityForm.handleSubmit(onComorbiditySubmit)()} className="w-full" size="icon" disabled={isComorbidityLoading}>
                        {isComorbidityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "S"}
                    </Button>
                     <p className="text-xs text-muted-foreground text-center mt-1">{t('comorbidity.submitShort')}</p>
                </div>

                {comorbidityResult && (
                    <div className="mt-4 p-3 rounded-md bg-muted group-data-[collapsible=icon]:hidden">
                    <h4 className="font-semibold">{comorbidityResult.present ? t('comorbidity.resultPresent') : t('comorbidity.resultAbsent')}</h4>
                    <p className="text-sm text-muted-foreground">{comorbidityResult.reasoning}</p>
                    </div>
                )}
                </CardContent>
            </Card>
            </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
