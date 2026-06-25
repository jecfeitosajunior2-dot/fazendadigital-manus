import { trpc } from "@/lib/trpc";
import { clearLocalAuthSession, getLocalAuthUser } from "@/lib/localAuth";
import { useLocation } from "wouter";

export function useAuth() {
  const localUser = getLocalAuthUser();
  const { data: user, isLoading: loading, error } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();
  const [, setLocation] = useLocation();

  const logout = async () => {
    clearLocalAuthSession();
    await logoutMutation.mutateAsync().catch(() => undefined);
    setLocation("/entrar");
  };

  return {
    user: user ?? localUser ?? null,
    loading: localUser ? false : loading,
    error: localUser ? null : error,
    isAuthenticated: !!user || !!localUser,
    logout,
  };
}
