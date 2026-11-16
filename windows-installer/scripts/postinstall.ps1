<#
  Configura o ambiente apos a copia dos arquivos pelo Inno Setup:
    1. Inicializa o PostgreSQL portatil (na primeira instalacao)
    2. Registra e inicia o servico do PostgreSQL (porta dedicada 5555)
    3. Cria o banco de dados e aplica a migration inicial (SQL puro)
    4. Gera o arquivo backend\.env (se ainda nao existir)
    5. Cria o usuario administrador padrao (idempotente)
    6. Registra e inicia o backend como servico do Windows via NSSM

  Idempotente: pode ser executado novamente (ex.: reparo/atualizacao) sem
  duplicar servicos, sobrescrever o .env do usuario ou recriar o admin.
#>
param(
    [Parameter(Mandatory = $true)][string]$InstallDir
)

$ErrorActionPreference = "Stop"

$DataDir     = Join-Path $env:ProgramData "EtiquetasPedidos"
$PgDataDir   = Join-Path $DataDir "pgdata"
$LogDir      = Join-Path $DataDir "logs"
$EnvFile     = Join-Path $InstallDir "backend\.env"

$NodeExe = Join-Path $InstallDir "node\node.exe"
$PgBin   = Join-Path $InstallDir "pgsql\bin"
$InitDb  = Join-Path $PgBin "initdb.exe"
$PgCtl   = Join-Path $PgBin "pg_ctl.exe"
$Psql    = Join-Path $PgBin "psql.exe"
$Nssm    = Join-Path $InstallDir "nssm\nssm.exe"

$PgPort         = 5555
$PgServiceName  = "EtiquetasPedidosPostgres"
$AppServiceName = "EtiquetasPedidosBackend"

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function New-RandomSecret {
    -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
}

Write-Host "==> Verificando instalacao do PostgreSQL portatil..."

# Senha fixa do superusuario local: o Postgres so aceita conexoes vindas da
# propria maquina (ligado a localhost, porta dedicada), entao isso nao expoe
# a senha na rede. O segredo que realmente protege o sistema (JWT_SECRET) e
# sempre gerado aleatoriamente abaixo.
$PgPassword = "postgres"

if (-not (Test-Path (Join-Path $PgDataDir "PG_VERSION"))) {
    Write-Host "==> Inicializando banco de dados (primeira instalacao)..."
    $PwFile = Join-Path $env:TEMP "etpg_$([guid]::NewGuid()).txt"
    Set-Content -Path $PwFile -Value $PgPassword -NoNewline -Encoding ASCII
    try {
        & $InitDb -D $PgDataDir -U postgres --pwfile=$PwFile -E UTF8 --locale=C | Write-Host
    } finally {
        Remove-Item $PwFile -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "==> Registrando servico do PostgreSQL..."
$existingPg = Get-Service -Name $PgServiceName -ErrorAction SilentlyContinue
if (-not $existingPg) {
    & $PgCtl register -N $PgServiceName -D $PgDataDir -o "-p $PgPort" | Write-Host
    & sc.exe config $PgServiceName start= auto | Out-Null
}
Start-Service -Name $PgServiceName
Write-Host "==> Aguardando o PostgreSQL aceitar conexoes..."
$env:PGPASSWORD = $PgPassword
$tentativas = 0
do {
    Start-Sleep -Seconds 2
    $tentativas++
    & $Psql -U postgres -p $PgPort -h localhost -tAc "SELECT 1" *> $null
} while ($LASTEXITCODE -ne 0 -and $tentativas -lt 15)
if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL nao respondeu apos varias tentativas. Verifique $LogDir."
}

Write-Host "==> Garantindo que o banco de dados exista..."
$dbExists = & $Psql -U postgres -p $PgPort -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='etiquetas_pedidos'"
if ($dbExists -notmatch "1") {
    & $Psql -U postgres -p $PgPort -h localhost -c "CREATE DATABASE etiquetas_pedidos;" | Write-Host
}

Write-Host "==> Aplicando estrutura do banco (migration inicial)..."
$jaMigrado = & $Psql -U postgres -p $PgPort -h localhost -d etiquetas_pedidos -tAc "SELECT to_regclass('public.pedidos')"
if ($jaMigrado -notmatch "pedidos") {
    $migrationFile = Get-ChildItem (Join-Path $InstallDir "backend\prisma\migrations\*\migration.sql") | Select-Object -First 1
    if (-not $migrationFile) {
        throw "Arquivo de migration nao encontrado em backend\prisma\migrations."
    }
    & $Psql -U postgres -p $PgPort -h localhost -d etiquetas_pedidos -f $migrationFile.FullName | Write-Host
} else {
    Write-Host "    Estrutura ja existente, migration ignorada."
}

if (-not (Test-Path $EnvFile)) {
    Write-Host "==> Gerando backend\.env..."
    $frontendPath = Join-Path $InstallDir "frontend"
    $jwtSecret = New-RandomSecret
    @"
PORT=3333
HOST=127.0.0.1
DATABASE_URL=postgresql://postgres:$PgPassword@localhost:$PgPort/etiquetas_pedidos?schema=public
JWT_SECRET=$jwtSecret
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:3333
PRINT_ADAPTER=mock
FRONTEND_DIST_PATH=$frontendPath
"@ | Set-Content -Path $EnvFile -Encoding UTF8
} else {
    Write-Host "==> backend\.env ja existe, mantendo configuracao atual."
}

Write-Host "==> Criando usuario administrador padrao (se necessario)..."
& $NodeExe (Join-Path $InstallDir "backend\scripts\seed.cjs") | Write-Host

Write-Host "==> Registrando servico do backend..."
$existingApp = Get-Service -Name $AppServiceName -ErrorAction SilentlyContinue
if (-not $existingApp) {
    & $Nssm install $AppServiceName $NodeExe "`"$(Join-Path $InstallDir 'backend\dist\server.js')`"" | Out-Null
    & $Nssm set $AppServiceName AppDirectory (Join-Path $InstallDir "backend") | Out-Null
    & $Nssm set $AppServiceName Start SERVICE_AUTO_START | Out-Null
    & $Nssm set $AppServiceName AppStdout (Join-Path $LogDir "backend.log") | Out-Null
    & $Nssm set $AppServiceName AppStderr (Join-Path $LogDir "backend-error.log") | Out-Null
    & $Nssm set $AppServiceName AppRotateFiles 1 | Out-Null
    & $Nssm set $AppServiceName AppRotateOnline 1 | Out-Null
    & $Nssm set $AppServiceName AppRotateBytes 5242880 | Out-Null
} else {
    & $Nssm restart $AppServiceName | Out-Null
}
Start-Service -Name $AppServiceName -ErrorAction SilentlyContinue

Write-Host "==> Instalacao concluida. Acesse http://localhost:3333"
