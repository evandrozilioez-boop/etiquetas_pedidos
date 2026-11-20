import { afterEach, describe, expect, it } from "vitest";
import { config, resetConfigForTests } from "@/lib/config";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  resetConfigForTests();
});

describe("configuração de produção", () => {
  it("recusa o reconhecimento simulado em produção", () => {
    process.env.APP_ENV = "production";
    process.env.FACE_PROVIDER = "mock";
    process.env.SESSION_SECRET = "segredo-de-producao-com-mais-de-32-caracteres";
    resetConfigForTests();
    expect(() => config()).toThrow(/FACE_PROVIDER=mock não é permitido/);
  });
  it("aceita produção sem IA (none) e recusa segredo de desenvolvimento", () => {
    process.env.APP_ENV = "production";
    process.env.FACE_PROVIDER = "none";
    process.env.SESSION_SECRET = "segredo-de-producao-com-mais-de-32-caracteres";
    resetConfigForTests();
    expect(config().FACE_PROVIDER).toBe("none");
    process.env.SESSION_SECRET = "dev-segredo-local-com-mais-de-32-caracteres-123";
    resetConfigForTests();
    expect(() => config()).toThrow(/desenvolvimento/);
  });
});
