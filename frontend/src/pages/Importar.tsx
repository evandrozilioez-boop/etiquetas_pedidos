import { ChangeEvent, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { importarPlanilha, importarZpl, ResultadoImportacao } from "../api/importacao";

export function Importar() {
  const [aba, setAba] = useState(0);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [zpl, setZpl] = useState("");
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function handleArquivo(e: ChangeEvent<HTMLInputElement>) {
    setArquivo(e.target.files?.[0] ?? null);
  }

  async function handleImportarPlanilha() {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    setResultado(null);
    try {
      const res = await importarPlanilha(arquivo);
      setResultado(res);
    } catch (err: any) {
      setErro(err?.response?.data?.erro ?? "Erro ao importar planilha");
    } finally {
      setEnviando(false);
    }
  }

  async function handleImportarZpl() {
    if (!zpl.trim()) return;
    setErro(null);
    setEnviando(true);
    setResultado(null);
    try {
      const res = await importarZpl(zpl);
      setResultado(res);
    } catch (err: any) {
      setErro(err?.response?.data?.erro ?? "Erro ao importar ZPL");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Box maxWidth={800}>
      <Typography variant="h5" fontWeight={700} mb={2}>
        Importar Pedidos
      </Typography>

      <Paper sx={{ p: 3 }}>
        <Tabs value={aba} onChange={(_, v) => setAba(v)} sx={{ mb: 2 }}>
          <Tab label="Planilha (Excel/CSV)" />
          <Tab label="ZPL (colar texto)" />
        </Tabs>

        {aba === 0 && (
          <Box display="flex" flexDirection="column" gap={2}>
            <Typography variant="body2" color="text.secondary">
              Envie um arquivo .xlsx ou .csv contendo, no minimo, as colunas: Pedido, OC, Codigo
              Produto, Descricao, Cliente, Cidade, UF, CEP, Volume, Quantidade, Transportadora,
              Marketplace, Codigo de Barras, QRCode e Arquivo ZPL.
            </Typography>
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
              {arquivo ? arquivo.name : "Selecionar arquivo"}
              <input type="file" hidden accept=".xlsx,.xls,.csv" onChange={handleArquivo} />
            </Button>
            <Button variant="contained" disabled={!arquivo || enviando} onClick={handleImportarPlanilha}>
              {enviando ? "Importando..." : "Importar planilha"}
            </Button>
          </Box>
        )}

        {aba === 1 && (
          <Box display="flex" flexDirection="column" gap={2}>
            <Typography variant="body2" color="text.secondary">
              Cole o conteudo ZPL da etiqueta. Os campos (Pedido, OC, Produto, Cliente, Cidade, UF,
              CEP, codigo de barras, QR Code, etc.) serao identificados automaticamente.
            </Typography>
            <TextField
              multiline
              minRows={10}
              placeholder="^XA ... ^XZ"
              value={zpl}
              onChange={(e) => setZpl(e.target.value)}
              sx={{ fontFamily: "monospace" }}
            />
            <Button variant="contained" disabled={!zpl.trim() || enviando} onClick={handleImportarZpl}>
              {enviando ? "Importando..." : "Importar ZPL"}
            </Button>
          </Box>
        )}

        {erro && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {erro}
          </Alert>
        )}

        {resultado && (
          <Box mt={3}>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="subtitle1" fontWeight={600} mb={1}>
              Resultado da importacao
            </Typography>
            <Box display="flex" gap={1} flexWrap="wrap" mb={1}>
              <Chip label={`Total: ${resultado.total}`} />
              <Chip label={`Criados: ${resultado.criados}`} color="success" />
              <Chip label={`Atualizados: ${resultado.atualizados}`} color="info" />
              <Chip label={`Inalterados: ${resultado.inalterados}`} />
              <Chip label={`Erros: ${resultado.erros.length}`} color={resultado.erros.length ? "error" : "default"} />
            </Box>
            {resultado.erros.length > 0 && (
              <Box component="ul" sx={{ m: 0, pl: 3 }}>
                {resultado.erros.map((e, i) => (
                  <li key={i}>
                    <Typography variant="body2">
                      Linha {e.linha}: {e.motivo}
                    </Typography>
                  </li>
                ))}
              </Box>
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
