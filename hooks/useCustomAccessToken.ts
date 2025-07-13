import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface chatwitAccessTokenData {
  chatwitAccessToken?: string;
  role?: string;
}

export function usechatwitAccessToken() {
  const { data: session } = useSession();
  const [data, setData] = useState<chatwitAccessTokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }

    const fetchchatwitAccessToken = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/user/custom-access-token");
        
        if (!response.ok) {
          throw new Error("Erro ao buscar dados do usuário");
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        console.error("Erro ao buscar chatwitAccessToken:", err);
        setError(err instanceof Error ? err.message : "Erro desconhecido");
      } finally {
        setLoading(false);
      }
    };

    fetchchatwitAccessToken();
  }, [session?.user?.id]);

  return { data, loading, error, refetch: () => {
    if (session?.user?.id) {
      setLoading(true);
      setError(null);
    }
  }};
} 