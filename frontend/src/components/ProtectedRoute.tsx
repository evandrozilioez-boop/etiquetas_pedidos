import { Navigate, Outlet } from "react-router-dom";
import { CircularProgress, Box } from "@mui/material";
import { useAuth } from "../contexts/AuthContext";
import { NivelUsuario } from "../types";

interface Props {
  niveisPermitidos?: NivelUsuario[];
}

export function ProtectedRoute({ niveisPermitidos }: Props) {
  const { usuario, carregando } = useAuth();

  if (carregando) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  if (niveisPermitidos && !niveisPermitidos.includes(usuario.nivel)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
