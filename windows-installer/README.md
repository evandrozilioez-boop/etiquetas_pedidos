# Instalador Windows (single-PC)

Este diretorio contem os artefatos usados para gerar `EtiquetasPedidosSetup.exe`,
um instalador que empacota **tudo** (Node.js, PostgreSQL, backend, frontend)
para rodar em um unico computador Windows, sem depender de instalar nada
manualmente e sem precisar de acesso a rede - cada componente roda como um
Servico do Windows, iniciando sozinho com o computador.

Ele nao e compilado localmente neste repositorio: o workflow
`.github/workflows/build-windows-installer.yml` baixa os binarios portateis
(Node.js, PostgreSQL, NSSM), builda o backend/frontend, monta a pasta
`windows-installer/build/` (gerada em tempo de build, nao versionada) e entao
compila `installer.iss` com o Inno Setup (`iscc.exe`, ja disponivel nos
runners `windows-latest` do GitHub Actions).

## Como gerar o instalador

1. No GitHub, va em **Actions -> Build Windows Installer -> Run workflow**
   (ou apenas faca um push nesta branch - o workflow tambem roda
   automaticamente).
2. Ao terminar, baixe o artefato `EtiquetasPedidosSetup` gerado pelo run.
3. Rode o `.exe` no computador Windows de destino (pede permissao de
   administrador - necessaria para registrar os servicos do Windows).

## O que o instalador faz

- Copia Node.js, PostgreSQL e NSSM (gerenciador de servicos) portateis, alem
  do backend compilado e do build do frontend, para
  `C:\Program Files\EtiquetasPedidos`.
- Inicializa um banco PostgreSQL dedicado em
  `C:\ProgramData\EtiquetasPedidos\pgdata`, ouvindo apenas em `localhost`
  numa porta propria (5555, para nao conflitar com outro Postgres que o
  usuario ja tenha instalado).
- Aplica a migration inicial do banco e cria o usuario administrador padrao
  (`admin` / `admin123` - troque assim que possivel).
- Registra dois Servicos do Windows (`EtiquetasPedidosPostgres` e
  `EtiquetasPedidosBackend`), ambos com inicializacao automatica.
- Cria atalhos no Menu Iniciar e na Area de Trabalho que abrem
  `http://localhost:3333` no navegador padrao.

## Desinstalacao

O desinstalador para e remove os dois servicos, mas **preserva** os dados em
`C:\ProgramData\EtiquetasPedidos` (banco de dados e `.env`) para o caso de
reinstalacao. Para apagar tudo definitivamente, remova essa pasta manualmente
depois de desinstalar.

## Licencas de terceiros empacotados

- **Node.js** - licenca MIT (https://github.com/nodejs/node/blob/main/LICENSE)
- **PostgreSQL** - licenca PostgreSQL (estilo MIT/BSD) (https://www.postgresql.org/about/licence/)
- **NSSM** - dominio publico / licenca permissiva (https://nssm.cc/license)

Nenhum desses projetos e modificado - apenas redistribuidos em sua forma
binaria oficial junto com o instalador.
