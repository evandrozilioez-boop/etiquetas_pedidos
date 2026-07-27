import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { autenticar } from "../middlewares/auth";
import { obterResumoDashboard } from "../services/dashboardService";

const router = Router();

router.get(
  "/",
  autenticar,
  asyncHandler(async (_req, res) => {
    const resumo = await obterResumoDashboard();
    res.json(resumo);
  })
);

export default router;
