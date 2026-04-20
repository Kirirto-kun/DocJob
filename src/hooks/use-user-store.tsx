'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import {
  getUsers,
  updateUser as updateUserAction,
  registerUser,
  type SerializedUser,
} from '@/app/actions';

// Legacy-compatible User type (role is lowercase for existing callers)
export type UserRole = 'admin' | 'doctor' | 'patient';

export type User = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  specialty: string;
  medicalRecords?: string;
  role: UserRole;
  password?: string;
  patientIds?: string[];
  fullName?: string | null;
  region?: string | null;
  age?: number | null;
  phoneNumber?: string | null;
  profilePhotoUrl?: string | null;
  consentAcceptedAt?: string | null;
  solvedCaseIds?: string[];
  unsolvedCaseIds?: string[];
};

function serializedToUser(s: SerializedUser): User {
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    avatar: s.avatar ?? '',
    specialty: s.specialty ?? '',
    medicalRecords: s.medicalRecords ?? undefined,
    role: s.role.toLowerCase() as UserRole,
    patientIds: s.patientIds,
    fullName: s.fullName,
    region: s.region,
    age: s.age,
    phoneNumber: s.phoneNumber,
    profilePhotoUrl: s.profilePhotoUrl,
    consentAcceptedAt: s.consentAcceptedAt,
    solvedCaseIds: s.solvedCaseIds,
    unsolvedCaseIds: s.unsolvedCaseIds,
  };
}

type UserStore = {
  currentUser: User | null;
  updateUser: (user: User) => Promise<void>;
  logout: () => Promise<void>;
  allUsers: User[];
  addUser: (user: User & { password?: string }) => Promise<void>;
  refreshUsers: () => Promise<void>;
  isInitialized: boolean;
};

const UserContext = createContext<UserStore | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isUsersLoaded, setIsUsersLoaded] = useState(false);

  const refreshUsers = useCallback(async () => {
    const res = await getUsers();
    if (res.success) {
      setAllUsers(res.data.map(serializedToUser));
    }
    setIsUsersLoaded(true);
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      void refreshUsers();
    } else if (status === 'unauthenticated') {
      setAllUsers([]);
      setIsUsersLoaded(true);
    }
  }, [status, refreshUsers]);

  const currentUser = useMemo<User | null>(() => {
    if (!session?.user?.id) return null;
    const found = allUsers.find((u) => u.id === session.user.id);
    if (found) return found;
    return {
      id: session.user.id,
      name: session.user.name ?? '',
      email: session.user.email ?? '',
      avatar: session.user.image ?? '',
      specialty: '',
      role: (session.user.role?.toLowerCase() as UserRole) ?? 'doctor',
    };
  }, [session, allUsers]);

  const addUser = useCallback(
    async (user: User & { password?: string }) => {
      const res = await registerUser({
        email: user.email,
        password: user.password ?? 'changeme123',
        name: user.name,
        fullName: user.fullName ?? undefined,
        region: user.region ?? undefined,
        age: user.age ?? undefined,
        specialty: user.specialty || undefined,
        phoneNumber: user.phoneNumber ?? undefined,
        role: user.role.toUpperCase() as 'ADMIN' | 'DOCTOR' | 'PATIENT',
      });
      if (!res.success) throw new Error(res.error);
      await refreshUsers();
    },
    [refreshUsers]
  );

  const updateUser = useCallback(
    async (user: User) => {
      const res = await updateUserAction({
        id: user.id,
        name: user.name,
        fullName: user.fullName ?? null,
        region: user.region ?? null,
        age: user.age ?? null,
        specialty: user.specialty || null,
        phoneNumber: user.phoneNumber ?? null,
        avatar: user.avatar || null,
        profilePhotoUrl: user.profilePhotoUrl ?? null,
        medicalRecords: user.medicalRecords ?? null,
        patientIds: user.patientIds ?? undefined,
      });
      if (!res.success) throw new Error(res.error);
      await refreshUsers();
    },
    [refreshUsers]
  );

  const logout = useCallback(async () => {
    await signOut({ redirect: false });
  }, []);

  const isInitialized = status !== 'loading' && (status === 'unauthenticated' || isUsersLoaded);

  return (
    <UserContext.Provider
      value={{ currentUser, updateUser, logout, allUsers, addUser, refreshUsers, isInitialized }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUserStore() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUserStore must be used within a UserProvider');
  }
  return context;
}

export async function signInWithCredentials(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const res = await signIn('credentials', {
    email,
    password,
    redirect: false,
  });
  if (!res) return { ok: false, error: 'Ошибка сети.' };
  if (res.error) return { ok: false, error: 'Неверные учётные данные.' };
  return { ok: true };
}
