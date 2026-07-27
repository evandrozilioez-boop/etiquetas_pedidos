export type NivelUsuario = "ADMINISTRADOR" | "OPERADOR" | "CONSULTA";

export type StatusPedido =
  | "AGUARDANDO_IMPRESSAO"
  | "EM_IMPRESSAO"
  | "IMPRESSO"
  | "REIMPRESSO"
  | "CANCELADO"
  | "EXPEDIDO";

export const STATUS_LABEL: Record<StatusPedido, string> = {
  AGUARDANDO_IMPRESSAO: "Aguardando Impressao",
  EM_IMPRESSAO: "Em Impressao",
  IMPRESSO: "Impresso",
  REIMPRESSO: "Reimpresso",
  CANCELADO: "Cancelado",
  EXPEDIDO: "Expedido",
};

export interface Usuario {
  id: string;
  nome: string;
  login: string;
  nivel: NivelUsuario;
  ativo?: boolean;
  criadoEm?: string;
}

export interface PedidoResumo {
  id: string;
  pedido: string;
  oc: string | null;
  produto: string | null;
  descricao: string | null;
  cliente: string | null;
  cidade: string | null;
  estado: string | null;
  volume: string | null;
  quantidade: number | null;
  marketplace: string | null;
  status: StatusPedido;
  dataImportacao: string;
  ultimaImpressao: string | null;
  quantidadeImpressoes: number;
}

export interface Impressao {
  id: string;
  dataHora: string;
  impressora: string | null;
  ipMaquina: string | null;
  copias: number;
  resultado: "SUCESSO" | "ERRO";
  mensagemErro: string | null;
  usuario?: { nome: string } | null;
}

export interface Historico {
  id: string;
  acao: string;
  dataHora: string;
  detalhes: string | null;
  usuario?: { nome: string } | null;
}

export interface PedidoDetalhe extends Omit<PedidoResumo, "ultimaImpressao" | "quantidadeImpressoes"> {
  cep: string | null;
  transportadora: string | null;
  codigoBarras: string | null;
  qrCode: string | null;
  zplOriginal: string;
  impressoes: Impressao[];
  historicos: Historico[];
}

export interface ListaPaginada<T> {
  total: number;
  pagina: number;
  tamanhoPagina: number;
  totalPaginas: number;
  itens: T[];
}

export interface ResumoDashboard {
  importadosHoje: number;
  aguardando: number;
  impressos: number;
  reimpressos: number;
  cancelados: number;
  expedidos: number;
  graficoDiario: Array<{ data: string; impressoes: number; erros: number }>;
  ultimosImpressos: Array<{
    id: string;
    pedido: string;
    cliente: string | null;
    cidade: string | null;
    usuario: string;
    dataHora: string;
    resultado: "SUCESSO" | "ERRO";
  }>;
}
