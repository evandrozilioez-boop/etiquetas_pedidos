import { ReactNode } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Toolbar,
  Typography,
} from "@mui/material";
import { useAuth } from "../contexts/AuthContext";

const LINKS = [
  { to: "/", label: "Dashboard", niveis: ["ADMINISTRADOR", "OPERADOR", "CONSULTA"] },
  { to: "/pedidos", label: "Pedidos", niveis: ["ADMINISTRADOR", "OPERADOR", "CONSULTA"] },
  { to: "/importar", label: "Importar", niveis: ["ADMINISTRADOR", "OPERADOR"] },
  { to: "/usuarios", label: "Usuarios", niveis: ["ADMINISTRADOR"] },
];

export function Layout({ children }: { children: ReactNode }) {
  const { usuario, sair } = useAuth();
  const location = useLocation();

  return (
    <Box minHeight="100vh" bgcolor="background.default">
      <AppBar position="static" color="primary" enableColorOnDark>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 0, fontWeight: 700 }}>
            Etiquetas de Pedidos
          </Typography>
          <Box sx={{ flexGrow: 1, display: "flex", gap: 1 }}>
            {LINKS.filter((l) => !usuario || l.niveis.includes(usuario.nivel)).map((l) => (
              <Button
                key={l.to}
                component={RouterLink}
                to={l.to}
                color="inherit"
                sx={{ opacity: location.pathname === l.to ? 1 : 0.75 }}
              >
                {l.label}
              </Button>
            ))}
          </Box>
          {usuario && (
            <>
              <Chip label={`${usuario.nome} (${usuario.nivel})`} color="secondary" size="small" />
              <Button color="inherit" onClick={() => sair()}>
                Sair
              </Button>
            </>
          )}
        </Toolbar>
      </AppBar>
      <Container maxWidth="xl" sx={{ py: 3 }}>
        {children}
      </Container>
    </Box>
  );
}
