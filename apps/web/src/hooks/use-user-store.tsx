'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getUsers,
  updateUser as updateUserAction,
  registerUser,
  type SerializedUser,
} from '@/app/actions';

// Legacy-compatible User type (role is lowercase for existing callers)
export type UserRole = 'admin' | 'doctor' | 'reviewer';

export type User = {
  id: string;
  name: string;
  email: string;
  specialty: string;
  role: UserRole;
  password?: string;
  fullName?: string | null;
  region?: string | null;
  age?: number | null;
  phoneNumber?: string | null;
  workplace?: string | null;
  academicDegree?: string | null;
  profilePhotoUrl?: string | null;
  consentAcceptedAt?: string | null;
};

function serializedToUser(s: SerializedUser): User {
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    specialty: s.specialty ?? '',
    role: s.role.toLowerCase() as UserRole,
    fullName: s.fullName,
    region: s.region,
    age: s.age,
    phoneNumber: s.phoneNumber,
    workplace: s.workplace,
    academicDegree: s.academicDegree,
    profilePhotoUrl: s.profilePhotoUrl,
    consentAcceptedAt: s.consentAcceptedAt,
  };
}

export type LoginResult = {
  ok: boolean;
  error?: string;
  reason?: 'pending' | 'invalid' | 'network';
};

type UserStore = {
  currentUser: User | null;
  updateUser: (user: User) => Promise<void>;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  allUsers: User[];
  addUser: (user: User & { password?: string }) => Promise<void>;
  refreshUsers: () => Promise<void>;
  isInitialized: boolean;
};

const UserContext = createContext<UserStore | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  // `meUser` mirrors what NextAuth's `session.user` used to carry: just the
  // identity/role, refreshed from `GET /api/auth/me` on mount (and on
  // login/logout). `currentUser` below re-derives the richer profile from
  // `allUsers` once that's loaded, same as the pre-cutover `useMemo` did off
  // `session` + `allUsers` — this is what makes a self `updateUser` call
  // show up in `currentUser` immediately (via `refreshUsers`) without a
  // re-login.
  const [meUser, setMeUser] = useState<User | null>(null);
  const [isMeLoaded, setIsMeLoaded] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isUsersLoaded, setIsUsersLoaded] = useState(false);

  const refreshUsers = useCallback(async () => {
    const res = await getUsers();
    if (res.success) {
      setAllUsers(res.data.map(serializedToUser));
    }
    setIsUsersLoaded(true);
  }, []);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      const data = (await res.json()) as { user: SerializedUser | null };
      setMeUser(data.user ? serializedToUser(data.user) : null);
    } catch {
      setMeUser(null);
    } finally {
      setIsMeLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (!isMeLoaded) return;
    if (meUser) {
      void refreshUsers();
    } else {
      setAllUsers([]);
      setIsUsersLoaded(true);
    }
    // Only re-run when the *identity* changes, not on every meUser object
    // reference — refreshUsers is stable (useCallback([])) so this only
    // fires on mount and on login/logout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMeLoaded, meUser?.id, refreshUsers]);

  const currentUser = useMemo<User | null>(() => {
    if (!meUser) return null;
    const found = allUsers.find((u) => u.id === meUser.id);
    return found ?? meUser;
  }, [meUser, allUsers]);

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
        role: user.role.toUpperCase() as 'ADMIN' | 'DOCTOR' | 'REVIEWER',
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
        profilePhotoUrl: user.profilePhotoUrl ?? null,
      });
      if (!res.success) throw new Error(res.error);
      await refreshUsers();
    },
    [refreshUsers]
  );

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        // `POST /api/auth/login`'s success payload is only `{ id, role,
        // approvedAt }` (see `packages/auth/src/login.service.ts`'s
        // `LoginResult` — `@docjob/auth` can't depend on `@docjob/core`'s
        // richer `SerializedUser`, by the one-way package boundary). Re-fetch
        // `/api/auth/me` for the authoritative full profile rather than
        // fabricating one from that minimal shape.
        await loadMe();
        return { ok: true };
      }

      const body = (await res.json().catch(() => ({}))) as {
        status?: 'pending' | 'invalid' | 'locked';
        retryAfterSeconds?: number;
      };

      if (body.status === 'pending') {
        return { ok: false, error: 'PendingApproval', reason: 'pending' };
      }
      if (body.status === 'locked') {
        const wait = body.retryAfterSeconds ?? 60;
        return {
          ok: false,
          error: `Слишком много попыток входа. Повторите через ${wait} сек.`,
          reason: 'invalid',
        };
      }
      return { ok: false, error: 'Неверные учётные данные.', reason: 'invalid' };
    } catch {
      return { ok: false, error: 'Ошибка сети.', reason: 'network' };
    }
  }, [loadMe]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    setMeUser(null);
  }, []);

  const isInitialized = isMeLoaded && (!meUser || isUsersLoaded);

  return (
    <UserContext.Provider
      value={{ currentUser, updateUser, login, logout, allUsers, addUser, refreshUsers, isInitialized }}
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
