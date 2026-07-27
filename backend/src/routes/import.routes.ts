import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { autenticar, autorizar } from "../middlewares/auth";
import { AppError } from "../utils/AppError";
import { planilhaParaLinhas, importarLinhas, LinhaPedido } from "../services/importService";
import { extrairCamposZpl } from "../services/zplParser";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(autenticar, autorizar("ADMINISTRADOR", "OPERADOR"));

router.post(
  "/planilha",
  upload.single("arquivo"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError("Nenhum arquivo enviado", 400);
    }
    const extensao = req.file.originalname.split(".").pop()?.toLowerCase();
    const ehCsv = extensao === "csv";
    const origem = ehCsv ? "CSV" : "EXCEL";

    const linhas = await planilhaParaLinhas(req.file.buffer, ehCsv);
    const resultado = await importarLinhas(linhas, origem, req.auth!.sub);
    res.json(resultado);
  })
);

const zplSchema = z.object({
  zpl: z.string().min(1),
  camposAdicionais: z
    .object({
      pedido: z.string().optional(),
      oc: z.string().optional(),
      cliente: z.string().optional(),
    })
    .partial()
    .optional(),
});

router.post(
  "/zpl",
  asyncHandler(async (req, res) => {
    const { zpl, camposAdicionais } = zplSchema.parse(req.body);
    const extraido = extrairCamposZpl(zpl);
    const linha: LinhaPedido = { ...extraido, ...camposAdicionais, pedido: camposAdicionais?.pedido ?? extraido.pedido ?? "", zplOriginal: zpl };
    const resultado = await importarLinhas([linha], "ZPL", req.auth!.sub);
    res.json(resultado);
  })
);

router.post(
  "/zpl/preview",
  asyncHandler(async (req, res) => {
    const { zpl } = zplSchema.pick({ zpl: true }).parse(req.body);
    res.json(extrairCamposZpl(zpl));
  })
);

export default router;
