import { Router } from "express";
import { z } from "zod";
import { NivelUsuario } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { autenticar, autorizar } from "../middlewares/auth";
import * as usuarioService from "../services/usuarioService";

const router = Router();

router.use(autenticar, autorizar("ADMINISTRADOR"));

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await usuarioService.listarUsuarios());
  })
);

const criarSchema = z.object({
  nome: z.string().min(1),
  login: z.string().min(1),
  senha: z.string().min(6),
  nivel: z.nativeEnum(NivelUsuario),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const dados = criarSchema.parse(req.body);
    const usuario = await usuarioService.criarUsuario(dados, req.auth!.sub);
    res.status(201).json(usuario);
  })
);

const atualizarSchema = z.object({
  nome: z.string().min(1).optional(),
  senha: z.string().min(6).optional(),
  nivel: z.nativeEnum(NivelUsuario).optional(),
  ativo: z.boolean().optional(),
});

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const dados = atualizarSchema.parse(req.body);
    const usuario = await usuarioService.atualizarUsuario(req.params.id, dados, req.auth!.sub);
    res.json(usuario);
  })
);

export default router;
