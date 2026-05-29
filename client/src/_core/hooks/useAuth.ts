import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

export function useAuth() {
  const { data: user, isLoading: loading, error } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();
  const [, setLocation] = useLocation();

  const logout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/entrar");
  };

  return {
    user: user ?? null,
    loading,
    error,
    isAuthenticated: !!user,
    logout,
  };
}
