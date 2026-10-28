import { trpc } from "@/lib/trpc";
import { clearLocalAuthSession } from "@/lib/localAuth";

export function useAuth() {
  const { data: user, isLoading: loading, error } = trpc.auth.me.useQuery(undefined, { retry: false });
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
    user: user ?? null,
    loading,
    error,
    isAuthenticated: !!user,
    logout,
  };
}
