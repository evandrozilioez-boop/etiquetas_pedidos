<#
  Executado pelo desinstalador antes de remover os arquivos:
    - Para e remove os servicos do Windows (backend e PostgreSQL)
  Os dados do banco (ProgramData\EtiquetasPedidos) NAO sao apagados aqui -
  isso preserva o historico de pedidos/impressoes caso o usuario reinstale.
  Para apagar tudo definitivamente, remova manualmente essa pasta.
#>
param(
    [Parameter(Mandatory = $true)][string]$InstallDir
)

$ErrorActionPreference = "SilentlyContinue"

$Nssm = Join-Path $InstallDir "nssm\nssm.exe"
$PgCtl = Join-Path $InstallDir "pgsql\bin\pg_ctl.exe"
$PgDataDir = Join-Path $env:ProgramData "EtiquetasPedidos\pgdata"

$AppServiceName = "EtiquetasPedidosBackend"
$PgServiceName = "EtiquetasPedidosPostgres"

Write-Host "==> Parando e removendo servico do backend..."
Stop-Service -Name $AppServiceName -Force
if (Test-Path $Nssm) {
    & $Nssm remove $AppServiceName confirm | Out-Null
}

Write-Host "==> Parando e removendo servico do PostgreSQL..."
Stop-Service -Name $PgServiceName -Force
if (Test-Path $PgCtl) {
    & $PgCtl unregister -N $PgServiceName | Out-Null
}

Write-Host "==> Servicos removidos. Os dados em $($env:ProgramData)\EtiquetasPedidos foram mantidos."
