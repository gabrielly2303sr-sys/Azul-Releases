$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$nodeMajor = [int](node -p "Number(process.versions.node.split('.')[0])")
if ($nodeMajor -lt 20) {
  throw "Node.js 20 ou mais recente é necessário. Versão detectada: $nodeMajor"
}

npm install
npm test
npm run dist:windows
Write-Host "`nBuild concluído. O instalador Windows está em: $PSScriptRoot\release\"
