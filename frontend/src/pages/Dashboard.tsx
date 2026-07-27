import { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { obterResumoDashboard } from "../api/dashboard";
import { ResumoDashboard } from "../types";

const CARTOES: Array<{ chave: keyof ResumoDashboard; label: string; cor: string }> = [
  { chave: "importadosHoje", label: "Importados Hoje", cor: "#0d47a1" },
  { chave: "aguardando", label: "Aguardando Impressao", cor: "#ef6c00" },
  { chave: "impressos", label: "Impressos", cor: "#2e7d32" },
  { chave: "reimpressos", label: "Reimpressos", cor: "#6a1b9a" },
  { chave: "cancelados", label: "Cancelados", cor: "#c62828" },
  { chave: "expedidos", label: "Expedidos", cor: "#00838f" },
];

export function Dashboard() {
  const [resumo, setResumo] = useState<ResumoDashboard | null>(null);

  useEffect(() => {
    obterResumoDashboard().then(setResumo);
  }, []);

  if (!resumo) return null;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>
        Dashboard
      </Typography>

      <Grid container spacing={2} mb={3}>
        {CARTOES.map((c) => (
          <Grid item xs={6} sm={4} md={2} key={c.chave}>
            <Card sx={{ borderTop: `4px solid ${c.cor}` }}>
              <CardContent>
                <Typography variant="h4" fontWeight={700}>
                  {resumo[c.chave] as number}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {c.label}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, height: 360 }}>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>
              Impressoes por dia (ultimos 14 dias)
            </Typography>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={resumo.graficoDiario}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="impressoes" name="Impressoes" fill="#0d47a1" />
                <Bar dataKey="erros" name="Erros" fill="#c62828" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: 360, overflow: "auto" }}>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>
              Ultimos pedidos impressos
            </Typography>
            <List dense>
              {resumo.ultimosImpressos.map((item) => (
                <ListItem key={item.id} divider>
                  <ListItemText
                    primary={`${item.pedido} - ${item.cliente ?? "N/D"}`}
                    secondary={`${item.usuario} em ${new Date(item.dataHora).toLocaleString("pt-BR")}`}
                  />
                  <Chip
                    size="small"
                    label={item.resultado}
                    color={item.resultado === "SUCESSO" ? "success" : "error"}
                  />
                </ListItem>
              ))}
              {resumo.ultimosImpressos.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Nenhuma impressao registrada ainda.
                </Typography>
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
