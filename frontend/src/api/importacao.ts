import { api } from "./client";

export interface ResultadoImportacao {
  total: number;
  criados: number;
  atualizados: number;
  inalterados: number;
  erros: Array<{ linha: number; motivo: string }>;
}

export async function importarPlanilha(arquivo: File): Promise<ResultadoImportacao> {
  const formData = new FormData();
  formData.append("arquivo", arquivo);
  const { data } = await api.post<ResultadoImportacao>("/importacao/planilha", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function importarZpl(zpl: string): Promise<ResultadoImportacao> {
  const { data } = await api.post<ResultadoImportacao>("/importacao/zpl", { zpl });
  return data;
}

export async function preVisualizarZpl(zpl: string) {
  const { data } = await api.post("/importacao/zpl/preview", { zpl });
  return data;
}
