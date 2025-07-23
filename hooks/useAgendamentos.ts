import { useEffect, useState } from "react";
import axios from "axios";
import { useParams } from "next/navigation";
import type { Agendamento } from "@/types/agendamento";

/**
 * Hook para buscar agendamentos usando o accountid da URL
 */
const useAgendamentos = (userID: string | undefined) => {
  const params = useParams();
  const accountid = params?.accountid as string;

  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgendamentos = async () => {
    // Se não existir userID ou accountid, não faz a busca
    if (!userID || !accountid) return;

    setLoading(true);

    try {
      // Usa a nova rota com o accountid na URL
      const response = await axios.get(`/api/${accountid}/agendar`);
      console.log("Resposta da API:", response.data);

      // A API retorna diretamente o array de agendamentos
      setAgendamentos(response.data || []);
      setError(null);
    } catch (err: any) {
      console.error("Erro ao buscar agendamentos:", err);
      setError(err.response?.data?.error || "Erro ao buscar agendamentos.");
      setAgendamentos([]);
    } finally {
      setLoading(false);
    }
  };

  // Faz a busca inicial assim que userID / accountid forem definidos
  useEffect(() => {
    fetchAgendamentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userID, accountid]);

  return { agendamentos, loading, error, refetch: fetchAgendamentos, accountid };
};

export default useAgendamentos;
