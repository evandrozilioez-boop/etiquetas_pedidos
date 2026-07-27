import { Router } from "express";
import { StatusPedido } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { autenticar, autorizar } from "../middlewares/auth";
import * as pedidoService from "../services/pedidoService";
import * as impressaoService from "../services/impressaoService";

const router = Router();

router.use(autenticar);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = req.query;
    const resultado = await pedidoService.listarPedidos({
      pedido: q.pedido as string | undefined,
      oc: q.oc as string | undefined,
      cliente: q.cliente as string | undefined,
      cidade: q.cidade as string | undefined,
      estado: q.estado as string | undefined,
      produto: q.produto as string | undefined,
      marketplace: q.marketplace as string | undefined,
      status: q.status as StatusPedido | undefined,
      dataInicio: q.dataInicio as string | undefined,
      dataFim: q.dataFim as string | undefined,
      busca: q.busca as string | undefined,
      pagina: q.pagina ? Number(q.pagina) : undefined,
      tamanhoPagina: q.tamanhoPagina ? Number(q.tamanhoPagina) : undefined,
    });
    res.json(resultado);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const pedido = await pedidoService.obterPedidoDetalhe(req.params.id);
    res.json(pedido);
  })
);

router.post(
  "/:id/imprimir",
  autorizar("ADMINISTRADOR", "OPERADOR"),
  asyncHandler(async (req, res) => {
    const resultado = await impressaoService.imprimirPedido({
      pedidoId: req.params.id,
      usuarioId: req.auth!.sub,
      impressora: req.body.impressora,
      ipMaquina: req.ip,
      copias: req.body.copias,
      reimpressao: false,
    });
    res.json(resultado);
  })
);

router.post(
  "/:id/reimprimir",
  autorizar("ADMINISTRADOR", "OPERADOR"),
  asyncHandler(async (req, res) => {
    const resultado = await impressaoService.imprimirPedido({
      pedidoId: req.params.id,
      usuarioId: req.auth!.sub,
      impressora: req.body.impressora,
      ipMaquina: req.ip,
      copias: req.body.copias,
      reimpressao: true,
    });
    res.json(resultado);
  })
);

router.post(
  "/:id/cancelar",
  autorizar("ADMINISTRADOR", "OPERADOR"),
  asyncHandler(async (req, res) => {
    await impressaoService.cancelarPedido(req.params.id, req.auth!.sub, req.body.motivo);
    res.status(204).send();
  })
);

router.post(
  "/:id/expedir",
  autorizar("ADMINISTRADOR", "OPERADOR"),
  asyncHandler(async (req, res) => {
    await impressaoService.expedirPedido(req.params.id, req.auth!.sub);
    res.status(204).send();
  })
);

export default router;
