$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'standard.csproj'
$release = Join-Path $PSScriptRoot 'release'
$staging = Join-Path $release 'Wrapped_1.16.0.0'
$archive = Join-Path $release 'Jelly-Wrapped-1.16.0.0-Jellyfin12.4.zip'

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw '.NET 10 SDK niet gevonden. Installeer de .NET 10 SDK voordat je bouwt.'
}

$sdks = & dotnet --list-sdks
if (-not ($sdks | Where-Object { $_ -match '^10\.' })) {
    throw '.NET 10 SDK is vereist (dotnet --list-sdks toont geen 10.x).'
}

& dotnet build $project --configuration Release
if ($LASTEXITCODE -ne 0) { throw 'Build mislukt; installatie-ZIP wordt niet gemaakt.' }

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $staging | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'bin/Release/net10.0/Wrapped.Core.dll') -Destination $staging
Copy-Item (Join-Path $PSScriptRoot 'meta.json') -Destination $staging
if (Test-Path $archive) { Remove-Item $archive -Force }
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $archive
Write-Host 'Build geslaagd. ZIP:' $archive -ForegroundColor Green
Write-Host 'Stop Jellyfin, maak een backup, pak de ZIP uit in een Wrapped pluginmap en start Jellyfin opnieuw.'
