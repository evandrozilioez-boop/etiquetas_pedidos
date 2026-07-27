import { api } from "./client";
import { ListaPaginada, PedidoDetalhe, PedidoResumo } from "../types";

export interface FiltrosPedido {
  pedido?: string;
  oc?: string;
  cliente?: string;
  cidade?: string;
  estado?: string;
  produto?: string;
  marketplace?: string;
  status?: string;
  dataInicio?: string;
  dataFim?: string;
  busca?: string;
  pagina?: number;
  tamanhoPagina?: number;
}

export async function listarPedidos(filtros: FiltrosPedido): Promise<ListaPaginada<PedidoResumo>> {
  const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== undefined && v !== ""));
  const { data } = await api.get<ListaPaginada<PedidoResumo>>("/pedidos", { params });
  return data;
}

export async function obterPedido(id: string): Promise<PedidoDetalhe> {
  const { data } = await api.get<PedidoDetalhe>(`/pedidos/${id}`);
  return data;
}

export interface ResultadoImpressao {
  sucesso: boolean;
  mensagemErro?: string;
}

export async function imprimirPedido(id: string, impressora?: string, copias = 1): Promise<ResultadoImpressao> {
  const { data } = await api.post<ResultadoImpressao>(`/pedidos/${id}/imprimir`, { impressora, copias });
  return data;
}

export async function reimprimirPedido(id: string, impressora?: string, copias = 1): Promise<ResultadoImpressao> {
  const { data } = await api.post<ResultadoImpressao>(`/pedidos/${id}/reimprimir`, { impressora, copias });
  return data;
}

export async function cancelarPedido(id: string, motivo?: string): Promise<void> {
  await api.post(`/pedidos/${id}/cancelar`, { motivo });
}

export async function expedirPedido(id: string): Promise<void> {
  await api.post(`/pedidos/${id}/expedir`);
}
