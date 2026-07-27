import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { listarUsuarios, criarUsuario, atualizarUsuario } from "../api/usuarios";
import { NivelUsuario, Usuario } from "../types";

const NIVEIS: NivelUsuario[] = ["ADMINISTRADOR", "OPERADOR", "CONSULTA"];

export function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", login: "", senha: "", nivel: "OPERADOR" as NivelUsuario });

  async function carregar() {
    setUsuarios(await listarUsuarios());
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleCriar() {
    setErro(null);
    try {
      await criarUsuario(form);
      setDialogAberto(false);
      setForm({ nome: "", login: "", senha: "", nivel: "OPERADOR" });
      carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.erro ?? "Erro ao criar usuario");
    }
  }

  async function handleToggleAtivo(usuario: Usuario) {
    await atualizarUsuario(usuario.id, { ativo: !usuario.ativo });
    carregar();
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5" fontWeight={700}>
          Usuarios
        </Typography>
        <Button variant="contained" onClick={() => setDialogAberto(true)}>
          Novo usuario
        </Button>
      </Box>

      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>Login</TableCell>
              <TableCell>Nivel</TableCell>
              <TableCell>Ativo</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.nome}</TableCell>
                <TableCell>{u.login}</TableCell>
                <TableCell>
                  <Chip size="small" label={u.nivel} />
                </TableCell>
                <TableCell>
                  <Switch checked={!!u.ativo} onChange={() => handleToggleAtivo(u)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={dialogAberto} onClose={() => setDialogAberto(false)} fullWidth maxWidth="xs">
        <DialogTitle>Novo usuario</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          {erro && <Alert severity="error">{erro}</Alert>}
          <TextField
            label="Nome"
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Login"
            value={form.login}
            onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Senha"
            type="password"
            value={form.senha}
            onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
            fullWidth
          />
          <TextField
            select
            label="Nivel"
            value={form.nivel}
            onChange={(e) => setForm((f) => ({ ...f, nivel: e.target.value as NivelUsuario }))}
            fullWidth
          >
            {NIVEIS.map((n) => (
              <MenuItem key={n} value={n}>
                {n}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogAberto(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCriar}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
