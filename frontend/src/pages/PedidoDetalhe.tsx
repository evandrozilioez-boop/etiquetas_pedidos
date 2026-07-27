import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { obterPedido, imprimirPedido, reimprimirPedido } from "../api/pedidos";
import { PedidoDetalhe, STATUS_LABEL, StatusPedido } from "../types";
import { useAuth } from "../contexts/AuthContext";

function Campo({ label, valor }: { label: string; valor: string | number | null | undefined }) {
  return (
    <Grid item xs={6} sm={4} md={3}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1">{valor ?? "-"}</Typography>
    </Grid>
  );
}

export function PedidoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const podeImprimir = usuario?.nivel === "ADMINISTRADOR" || usuario?.nivel === "OPERADOR";

  const [pedido, setPedido] = useState<PedidoDetalhe | null>(null);
  const [mensagem, setMensagem] = useState<{ texto: string; tipo: "success" | "error" } | null>(null);

  async function carregar() {
    if (!id) return;
    const data = await obterPedido(id);
    setPedido(data);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAcao(reimpressao: boolean) {
    if (!id) return;
    try {
      const resultado = reimpressao ? await reimprimirPedido(id) : await imprimirPedido(id);
      setMensagem(
        resultado.sucesso
          ? { texto: "Etiqueta enviada para impressao com sucesso.", tipo: "success" }
          : { texto: `Falha na impressao: ${resultado.mensagemErro}`, tipo: "error" }
      );
      carregar();
    } catch (err: any) {
      setMensagem({ texto: err?.response?.data?.erro ?? "Erro ao processar impressao", tipo: "error" });
    }
  }

  if (!pedido) return null;

  const jaImpresso = pedido.status === "IMPRESSO" || pedido.status === "REIMPRESSO";

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
        Voltar
      </Button>

      {mensagem && (
        <Alert severity={mensagem.tipo} sx={{ mb: 2 }} onClose={() => setMensagem(null)}>
          {mensagem.texto}
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5" fontWeight={700}>
            Pedido {pedido.pedido}
          </Typography>
          <Box display="flex" gap={1} alignItems="center">
            <Chip label={STATUS_LABEL[pedido.status as StatusPedido]} color="primary" />
            {podeImprimir && (
              <>
                <Button
                  variant="contained"
                  disabled={jaImpresso || pedido.status === "CANCELADO"}
                  onClick={() => handleAcao(false)}
                >
                  Imprimir
                </Button>
                <Button variant="outlined" disabled={!jaImpresso} onClick={() => handleAcao(true)}>
                  Reimprimir
                </Button>
              </>
            )}
          </Box>
        </Box>

        <Grid container spacing={2}>
          <Campo label="OC" valor={pedido.oc} />
          <Campo label="Codigo Produto" valor={pedido.produto} />
          <Campo label="Descricao" valor={pedido.descricao} />
          <Campo label="Cliente" valor={pedido.cliente} />
          <Campo label="Cidade" valor={pedido.cidade} />
          <Campo label="UF" valor={pedido.estado} />
          <Campo label="CEP" valor={pedido.cep} />
          <Campo label="Volume" valor={pedido.volume} />
          <Campo label="Quantidade" valor={pedido.quantidade} />
          <Campo label="Transportadora" valor={pedido.transportadora} />
          <Campo label="Marketplace" valor={pedido.marketplace} />
          <Campo label="Codigo de Barras" valor={pedido.codigoBarras} />
          <Campo label="QR Code" valor={pedido.qrCode} />
          <Campo label="Importado em" valor={new Date(pedido.dataImportacao).toLocaleString("pt-BR")} />
        </Grid>
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>
              Historico de Impressoes
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Data/Hora</TableCell>
                  <TableCell>Usuario</TableCell>
                  <TableCell>Copias</TableCell>
                  <TableCell>Resultado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pedido.impressoes.map((imp) => (
                  <TableRow key={imp.id}>
                    <TableCell>{new Date(imp.dataHora).toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{imp.usuario?.nome ?? "N/D"}</TableCell>
                    <TableCell>{imp.copias}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={imp.resultado}
                        color={imp.resultado === "SUCESSO" ? "success" : "error"}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {pedido.impressoes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography variant="body2" color="text.secondary">
                        Nenhuma impressao registrada.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>
              Auditoria / Historico de Acoes
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Data/Hora</TableCell>
                  <TableCell>Acao</TableCell>
                  <TableCell>Usuario</TableCell>
                  <TableCell>Detalhes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pedido.historicos.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{new Date(h.dataHora).toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{h.acao}</TableCell>
                    <TableCell>{h.usuario?.nome ?? "Sistema"}</TableCell>
                    <TableCell>{h.detalhes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={600} mb={1}>
          ZPL Original
        </Typography>
        <Box
          component="pre"
          sx={{
            bgcolor: "grey.900",
            color: "grey.100",
            p: 2,
            borderRadius: 1,
            overflow: "auto",
            fontSize: 12,
            maxHeight: 300,
          }}
        >
          {pedido.zplOriginal}
        </Box>
      </Paper>
    </Box>
  );
}
