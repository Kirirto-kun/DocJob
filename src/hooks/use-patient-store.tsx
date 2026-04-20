'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getCases,
  createCase,
  updateCase as updateCaseAction,
  deleteCase as deleteCaseAction,
  type SerializedCase,
  type SerializedCaseImage,
} from '@/app/actions';
import { useUserStore } from './use-user-store';

export type PatientScenario = {
  scenarioDescription: string;
  learningObjectives: string[];
  comorbidities: string;
};

export type PatientImage = {
  id: string;
  filename: string;
  mimeType: string;
  url: string;
  order: number;
};

export type Patient = {
  id: string;
  doctorId: string;
  name: string;
  age: number;
  gender: string;
  primaryCondition: string;
  history: string;
  scenario: PatientScenario;
  subgroup?: string | null;
  specialty?: string | null;
  tags?: string[];
  images?: PatientImage[];
  attachedImages?: PatientImage[]; // alias for backward compat
  createdAt?: string;
};

function serializedToPatient(c: SerializedCase): Patient {
  const images = c.images.map<PatientImage>((i) => ({
    id: i.id,
    filename: i.filename,
    mimeType: i.mimeType,
    url: i.url,
    order: i.order,
  }));
  return {
    id: c.id,
    doctorId: c.authorId,
    name: c.name,
    age: c.age ?? 0,
    gender: c.gender ?? '',
    primaryCondition: c.primaryCondition ?? '',
    history: c.history ?? '',
    scenario: {
      scenarioDescription: c.scenarioDescription ?? '',
      learningObjectives: c.learningObjectives,
      comorbidities: c.comorbidities ?? '',
    },
    subgroup: c.subgroup,
    specialty: c.specialty,
    tags: c.tags,
    images,
    attachedImages: images,
    createdAt: c.createdAt,
  };
}

type PatientStore = {
  patients: Patient[];
  addPatient: (patient: Patient) => Promise<void>;
  updatePatient: (patient: Patient) => Promise<void>;
  deletePatient: (id: string) => Promise<void>;
  activePatient: Patient | null;
  setActivePatient: (patientId: string | null) => void;
  refreshPatients: () => Promise<void>;
  isInitialized: boolean;
};

const PatientContext = createContext<PatientStore | null>(null);

const ACTIVE_PATIENT_KEY = (userId: string) => `activePatient_${userId}`;

export function PatientProvider({ children }: { children: React.ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [activePatientId, setActivePatientIdState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const { currentUser, isInitialized: userIsInitialized } = useUserStore();

  const refreshPatients = useCallback(async () => {
    const res = await getCases();
    if (res.success) {
      setPatients(res.data.map(serializedToPatient));
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (userIsInitialized && currentUser) {
      void refreshPatients();
    } else if (userIsInitialized && !currentUser) {
      setPatients([]);
      setIsLoaded(true);
    }
  }, [userIsInitialized, currentUser, refreshPatients]);

  useEffect(() => {
    if (currentUser && isLoaded) {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_PATIENT_KEY(currentUser.id)) : null;
      if (stored && patients.some((p) => p.id === stored)) {
        setActivePatientIdState(stored);
      }
    }
  }, [currentUser, isLoaded, patients]);

  const activePatient = useMemo(
    () => patients.find((p) => p.id === activePatientId) ?? null,
    [patients, activePatientId]
  );

  const setActivePatient = useCallback(
    (patientId: string | null) => {
      setActivePatientIdState(patientId);
      if (currentUser && typeof window !== 'undefined') {
        if (patientId) {
          localStorage.setItem(ACTIVE_PATIENT_KEY(currentUser.id), patientId);
        } else {
          localStorage.removeItem(ACTIVE_PATIENT_KEY(currentUser.id));
        }
      }
    },
    [currentUser]
  );

  const addPatient = useCallback(
    async (patient: Patient) => {
      const res = await createCase({
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        primaryCondition: patient.primaryCondition,
        history: patient.history,
        scenarioDescription: patient.scenario.scenarioDescription,
        learningObjectives: patient.scenario.learningObjectives,
        comorbidities: patient.scenario.comorbidities,
        subgroup: patient.subgroup ?? undefined,
        specialty: patient.specialty ?? undefined,
        tags: patient.tags ?? [],
        imageFilenames: (patient.images ?? []).map((i) => ({ filename: i.filename, mimeType: i.mimeType })),
      });
      if (!res.success) throw new Error(res.error);
      await refreshPatients();
    },
    [refreshPatients]
  );

  const updatePatient = useCallback(
    async (patient: Patient) => {
      const res = await updateCaseAction({
        id: patient.id,
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        primaryCondition: patient.primaryCondition,
        history: patient.history,
        scenarioDescription: patient.scenario.scenarioDescription,
        learningObjectives: patient.scenario.learningObjectives,
        comorbidities: patient.scenario.comorbidities,
        subgroup: patient.subgroup ?? undefined,
        specialty: patient.specialty ?? undefined,
        tags: patient.tags ?? [],
      });
      if (!res.success) throw new Error(res.error);
      await refreshPatients();
    },
    [refreshPatients]
  );

  const deletePatient = useCallback(
    async (id: string) => {
      const res = await deleteCaseAction(id);
      if (!res.success) throw new Error(res.error);
      if (activePatientId === id) setActivePatient(null);
      await refreshPatients();
    },
    [activePatientId, refreshPatients, setActivePatient]
  );

  return (
    <PatientContext.Provider
      value={{
        patients,
        addPatient,
        updatePatient,
        deletePatient,
        activePatient,
        setActivePatient,
        refreshPatients,
        isInitialized: userIsInitialized && isLoaded,
      }}
    >
      {children}
    </PatientContext.Provider>
  );
}

export function usePatientStore() {
  const context = useContext(PatientContext);
  if (!context) {
    throw new Error('usePatientStore must be used within a PatientProvider');
  }
  return context;
}
