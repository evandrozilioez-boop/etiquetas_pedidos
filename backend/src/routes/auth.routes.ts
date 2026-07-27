import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import * as authService from "../services/authService";
import { autenticar } from "../middlewares/auth";

const router = Router();

const loginSchema = z.object({
  login: z.string().min(1),
  senha: z.string().min(1),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { login, senha } = loginSchema.parse(req.body);
    const resultado = await authService.login(login, senha);
    res.json(resultado);
  })
);

router.post(
  "/logout",
  autenticar,
  asyncHandler(async (req, res) => {
    await authService.logout(req.auth!.sub);
    res.status(204).send();
  })
);

router.get(
  "/me",
  autenticar,
  asyncHandler(async (req, res) => {
    res.json(req.auth);
  })
);

export default router;
