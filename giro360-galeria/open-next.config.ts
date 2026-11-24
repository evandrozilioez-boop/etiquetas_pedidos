import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sem cache incremental: todas as páginas são dinâmicas (dependem de sessão, prazos e URLs assinadas).
export default defineCloudflareConfig({});
