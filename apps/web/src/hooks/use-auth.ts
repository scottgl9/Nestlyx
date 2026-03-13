'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

export function useAuth(requireAuth = true) {
  const router = useRouter();
  const { token, user, logout } = useAuthStore();

  useEffect(() => {
    if (requireAuth && !token) {
      router.replace('/login');
    }
  }, [requireAuth, token, router]);

  return { token, user, logout, isAuthenticated: !!token };
}
