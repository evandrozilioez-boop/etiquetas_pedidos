import { Router } from "express";
import authRoutes from "./auth.routes";
import pedidosRoutes from "./pedidos.routes";
import importRoutes from "./import.routes";
import dashboardRoutes from "./dashboard.routes";
import usuariosRoutes from "./usuarios.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/pedidos", pedidosRoutes);
router.use("/importacao", importRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/usuarios", usuariosRoutes);

export default router;
