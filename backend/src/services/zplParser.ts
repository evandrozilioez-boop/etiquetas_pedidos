/**
 * Extrator automatico de campos a partir do conteudo ZPL de uma etiqueta.
 *
 * Estrategia: o ZPL organiza o conteudo impresso em blocos "^FO ... ^FS"
 * (Field Origin / Field Separator). Dentro de cada bloco pode haver um
 * comando de codigo de barras (^BC, ^B3, ^BE, ^BX, ...), um QR Code (^BQ)
 * ou apenas texto (^FD ... ^FS). Percorremos cada bloco, capturamos o
 * texto de dado (^FD) e classificamos o campo por:
 *   1. Presenca de comando de barras/QR no bloco;
 *   2. Rotulo textual reconhecido (ex.: "PEDIDO:", "OC:", "CEP:");
 *   3. Padroes de formato (CEP, UF) quando nao ha rotulo.
 *
 * Como cada layout de etiqueta pode variar, os campos nao identificados
 * simplesmente ficam nulos - o ZPL original e sempre preservado por completo.
 */

export interface CamposExtraidosZpl {
  pedido?: string;
  oc?: string;
  produto?: string;
  descricao?: string;
  cliente?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  volume?: string;
  quantidade?: number;
  transportadora?: string;
  marketplace?: string;
  codigoBarras?: string;
  qrCode?: string;
}

const ESTADOS_BR = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
]);

const ROTULOS: Array<{ regex: RegExp; campo: keyof CamposExtraidosZpl }> = [
  { regex: /^(?:PEDIDO|PED|N[UÚ]?\.?\s*PEDIDO)\s*[:#-]?\s*/i, campo: "pedido" },
  { regex: /^(?:OC|ORDEM\s*DE\s*COMPRA)\s*[:#-]?\s*/i, campo: "oc" },
  { regex: /^(?:C[OÓ]D(?:IGO)?\.?\s*PRODUTO|SKU|C[OÓ]D\.?\s*ITEM)\s*[:#-]?\s*/i, campo: "produto" },
  { regex: /^(?:DESCRI[CÇ][AÃ]O|DESC|PRODUTO)\s*[:#-]?\s*/i, campo: "descricao" },
  { regex: /^(?:CLIENTE|DESTINAT[AÁ]RIO|COMPRADOR)\s*[:#-]?\s*/i, campo: "cliente" },
  { regex: /^(?:CIDADE|MUNIC[IÍ]PIO)\s*[:#-]?\s*/i, campo: "cidade" },
  { regex: /^(?:UF|ESTADO)\s*[:#-]?\s*/i, campo: "estado" },
  { regex: /^(?:CEP)\s*[:#-]?\s*/i, campo: "cep" },
  { regex: /^(?:VOLUME|VOL)\s*[:#-]?\s*/i, campo: "volume" },
  { regex: /^(?:QUANTIDADE|QTD|QTDE)\s*[:#-]?\s*/i, campo: "quantidade" },
  { regex: /^(?:TRANSPORTADORA|TRANSP)\s*[:#-]?\s*/i, campo: "transportadora" },
  { regex: /^(?:MARKETPLACE|CANAL|LOJA|PLATAFORMA)\s*[:#-]?\s*/i, campo: "marketplace" },
];

const CEP_REGEX = /\b\d{5}-?\d{3}\b/;

function extrairBlocosCampo(zpl: string): string[] {
  const blocos: string[] = [];
  const regexBloco = /\^FO[\s\S]*?\^FS/g;
  let match: RegExpExecArray | null;
  while ((match = regexBloco.exec(zpl)) !== null) {
    blocos.push(match[0]);
  }
  return blocos;
}

function extrairFD(bloco: string): string | undefined {
  const match = /\^FD([\s\S]*?)(?:\^FS|$)/.exec(bloco);
  if (!match) return undefined;
  return match[1].replace(/\\&/g, "").trim();
}

function ehBlocoQrCode(bloco: string): boolean {
  return /\^BQ/i.test(bloco);
}

function ehBlocoCodigoBarras(bloco: string): boolean {
  return /\^B[C238ADEKPQRUX]/i.test(bloco) && !ehBlocoQrCode(bloco);
}

export function extrairCamposZpl(zplOriginal: string): CamposExtraidosZpl {
  const campos: CamposExtraidosZpl = {};
  const blocos = extrairBlocosCampo(zplOriginal);

  for (const bloco of blocos) {
    let conteudo = extrairFD(bloco);
    if (!conteudo) continue;

    // Comando ^BQ (QR Code) costuma prefixar o payload com "modo,dados" (ex.: "QA,http://...")
    if (ehBlocoQrCode(bloco)) {
      const semPrefixo = conteudo.replace(/^[A-Z0-9]{1,2},/, "");
      campos.qrCode = semPrefixo || conteudo;
      continue;
    }

    if (ehBlocoCodigoBarras(bloco)) {
      campos.codigoBarras = conteudo;
      continue;
    }

    let identificado = false;
    for (const { regex, campo } of ROTULOS) {
      if (regex.test(conteudo)) {
        const valor = conteudo.replace(regex, "").trim();
        if (campo === "quantidade") {
          const numero = parseInt(valor.replace(/\D/g, ""), 10);
          if (!Number.isNaN(numero)) campos.quantidade = numero;
        } else {
          (campos[campo] as string | undefined) = valor;
        }
        identificado = true;
        break;
      }
    }

    if (identificado) continue;

    // Sem rotulo explicito: tenta reconhecer por formato
    if (!campos.cep && CEP_REGEX.test(conteudo) && conteudo.length <= 12) {
      campos.cep = conteudo.match(CEP_REGEX)?.[0];
      continue;
    }
    if (!campos.estado && ESTADOS_BR.has(conteudo.toUpperCase()) && conteudo.length <= 3) {
      campos.estado = conteudo.toUpperCase();
      continue;
    }
  }

  return campos;
}
