import { trpc } from "@/lib/trpc";
import { clearLocalAuthSession, getLocalAuthUser } from "@/lib/localAuth";

export function useAuth() {
  const localUser = getLocalAuthUser();
  const { data: user, isLoading: loading, error } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();

  const logout = async () => {
    clearLocalAuthSession();
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // ignora — redirecionamento abaixo garante saída
    }
    window.location.href = "/api/auth/logout";
  };

  return {
    user: user ?? localUser ?? null,
    loading: localUser ? false : loading,
    error: localUser ? null : error,
    isAuthenticated: !!user || !!localUser,
    logout,
  };
}
