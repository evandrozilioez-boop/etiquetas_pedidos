import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";
import { useAuth } from "../contexts/AuthContext";

export function Login() {
  const { usuario, entrar } = useAuth();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (usuario) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(login, senha);
    } catch (err: any) {
      setErro(err?.response?.data?.erro ?? "Falha ao entrar. Verifique usuario e senha.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Box
      minHeight="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bgcolor="background.default"
    >
      <Paper elevation={3} sx={{ p: 4, width: 360 }}>
        <Typography variant="h5" fontWeight={700} mb={1}>
          Etiquetas de Pedidos
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          Acesse com seu usuario para continuar
        </Typography>
        <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2}>
          {erro && <Alert severity="error">{erro}</Alert>}
          <TextField
            label="Login"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoFocus
            required
          />
          <TextField
            label="Senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
          <Button type="submit" variant="contained" size="large" disabled={enviando}>
            {enviando ? "Entrando..." : "Entrar"}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
