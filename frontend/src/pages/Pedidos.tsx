import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import PrintIcon from "@mui/icons-material/Print";
import ReplayIcon from "@mui/icons-material/Replay";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { listarPedidos, imprimirPedido, reimprimirPedido, FiltrosPedido } from "../api/pedidos";
import { PedidoResumo, STATUS_LABEL, StatusPedido } from "../types";
import { useAuth } from "../contexts/AuthContext";

const STATUS_COR: Record<StatusPedido, "default" | "warning" | "success" | "info" | "error" | "primary"> = {
  AGUARDANDO_IMPRESSAO: "warning",
  EM_IMPRESSAO: "info",
  IMPRESSO: "success",
  REIMPRESSO: "primary",
  CANCELADO: "error",
  EXPEDIDO: "default",
};

export function Pedidos() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const podeImprimir = usuario?.nivel === "ADMINISTRADOR" || usuario?.nivel === "OPERADOR";

  const [filtros, setFiltros] = useState<FiltrosPedido>({ pagina: 1, tamanhoPagina: 25 });
  const [linhas, setLinhas] = useState<PedidoResumo[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; tipo: "success" | "error" } | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const resultado = await listarPedidos(filtros);
      setLinhas(resultado.itens);
      setTotal(resultado.total);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  async function handleImprimir(id: string, reimpressao: boolean) {
    try {
      const resultado = reimpressao ? await reimprimirPedido(id) : await imprimirPedido(id);
      if (resultado.sucesso) {
        setMensagem({ texto: "Etiqueta enviada para impressao com sucesso.", tipo: "success" });
      } else {
        setMensagem({ texto: `Falha na impressao: ${resultado.mensagemErro}`, tipo: "error" });
      }
      carregar();
    } catch (err: any) {
      setMensagem({ texto: err?.response?.data?.erro ?? "Erro ao processar impressao", tipo: "error" });
    }
  }

  const colunas: GridColDef<PedidoResumo>[] = [
    { field: "pedido", headerName: "Pedido", width: 130 },
    { field: "cliente", headerName: "Cliente", flex: 1, minWidth: 160 },
    { field: "produto", headerName: "Produto", flex: 1, minWidth: 140 },
    { field: "cidade", headerName: "Cidade", width: 130 },
    { field: "volume", headerName: "Volume", width: 90 },
    {
      field: "status",
      headerName: "Status",
      width: 170,
      renderCell: (params) => (
        <Chip size="small" label={STATUS_LABEL[params.value as StatusPedido]} color={STATUS_COR[params.value as StatusPedido]} />
      ),
    },
    {
      field: "ultimaImpressao",
      headerName: "Ultima Impressao",
      width: 170,
      valueFormatter: (value?: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "-"),
    },
    { field: "quantidadeImpressoes", headerName: "Qtd. Impressoes", width: 130, type: "number" },
    {
      field: "acoes",
      headerName: "Acoes",
      width: 160,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box display="flex" gap={0.5}>
          <Tooltip title="Visualizar">
            <IconButton size="small" onClick={() => navigate(`/pedidos/${params.row.id}`)}>
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {podeImprimir && (
            <>
              <Tooltip title="Imprimir">
                <span>
                  <IconButton
                    size="small"
                    color="primary"
                    disabled={params.row.status === "IMPRESSO" || params.row.status === "REIMPRESSO" || params.row.status === "CANCELADO"}
                    onClick={() => handleImprimir(params.row.id, false)}
                  >
                    <PrintIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Reimprimir">
                <span>
                  <IconButton
                    size="small"
                    color="secondary"
                    disabled={params.row.status !== "IMPRESSO" && params.row.status !== "REIMPRESSO"}
                    onClick={() => handleImprimir(params.row.id, true)}
                  >
                    <ReplayIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={2}>
        Pedidos
      </Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Pesquisa rapida"
              size="small"
              value={filtros.busca ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value, pagina: 1 }))}
            />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <TextField
              fullWidth
              label="Pedido"
              size="small"
              value={filtros.pedido ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, pedido: e.target.value, pagina: 1 }))}
            />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <TextField
              fullWidth
              label="OC"
              size="small"
              value={filtros.oc ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, oc: e.target.value, pagina: 1 }))}
            />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <TextField
              fullWidth
              label="Cliente"
              size="small"
              value={filtros.cliente ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, cliente: e.target.value, pagina: 1 }))}
            />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <TextField
              fullWidth
              label="Cidade"
              size="small"
              value={filtros.cidade ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, cidade: e.target.value, pagina: 1 }))}
            />
          </Grid>
          <Grid item xs={6} sm={3} md={1}>
            <TextField
              fullWidth
              label="UF"
              size="small"
              value={filtros.estado ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value, pagina: 1 }))}
            />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <TextField
              fullWidth
              label="Produto"
              size="small"
              value={filtros.produto ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, produto: e.target.value, pagina: 1 }))}
            />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <TextField
              fullWidth
              label="Marketplace"
              size="small"
              value={filtros.marketplace ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, marketplace: e.target.value, pagina: 1 }))}
            />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <TextField
              select
              fullWidth
              label="Status"
              size="small"
              value={filtros.status ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, status: e.target.value || undefined, pagina: 1 }))}
            >
              <MenuItem value="">Todos</MenuItem>
              {Object.entries(STATUS_LABEL).map(([valor, label]) => (
                <MenuItem key={valor} value={valor}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <TextField
              fullWidth
              type="date"
              label="Data inicio"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={filtros.dataInicio ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, dataInicio: e.target.value, pagina: 1 }))}
            />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <TextField
              fullWidth
              type="date"
              label="Data fim"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={filtros.dataFim ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, dataFim: e.target.value, pagina: 1 }))}
            />
          </Grid>
          <Grid item xs={12} md={2} display="flex" alignItems="center">
            <Button fullWidth variant="outlined" onClick={() => setFiltros({ pagina: 1, tamanhoPagina: 25 })}>
              Limpar filtros
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ height: 600 }}>
        <DataGrid
          rows={linhas}
          columns={colunas}
          loading={carregando}
          rowCount={total}
          paginationMode="server"
          paginationModel={{ page: (filtros.pagina ?? 1) - 1, pageSize: filtros.tamanhoPagina ?? 25 }}
          onPaginationModelChange={(model) =>
            setFiltros((f) => ({ ...f, pagina: model.page + 1, tamanhoPagina: model.pageSize }))
          }
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
        />
      </Paper>

      <Snackbar open={!!mensagem} autoHideDuration={4000} onClose={() => setMensagem(null)}>
        {mensagem ? <Alert severity={mensagem.tipo}>{mensagem.texto}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
