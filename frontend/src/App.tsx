import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Pedidos } from "./pages/Pedidos";
import { PedidoDetalhePage } from "./pages/PedidoDetalhe";
import { Importar } from "./pages/Importar";
import { Usuarios } from "./pages/Usuarios";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Layout><Dashboard /></Layout>} />
        <Route path="/pedidos" element={<Layout><Pedidos /></Layout>} />
        <Route path="/pedidos/:id" element={<Layout><PedidoDetalhePage /></Layout>} />
      </Route>

      <Route element={<ProtectedRoute niveisPermitidos={["ADMINISTRADOR", "OPERADOR"]} />}>
        <Route path="/importar" element={<Layout><Importar /></Layout>} />
      </Route>

      <Route element={<ProtectedRoute niveisPermitidos={["ADMINISTRADOR"]} />}>
        <Route path="/usuarios" element={<Layout><Usuarios /></Layout>} />
      </Route>
    </Routes>
  );
}
