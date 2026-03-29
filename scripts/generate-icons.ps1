$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repoRoot 'public\leg3ndy-studio-icon.png'
$outputDir = Join-Path $repoRoot 'public\icons'
$sizes = @(16, 32, 64, 128, 256, 512, 1024)

if (-not (Test-Path $sourcePath)) {
    throw "Icon source not found: $sourcePath"
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

function Get-OpaqueBounds {
    param(
        [System.Drawing.Bitmap]$Bitmap,
        [int]$AlphaThreshold = 12
    )

    $minX = $Bitmap.Width
    $minY = $Bitmap.Height
    $maxX = -1
    $maxY = -1

    for ($y = 0; $y -lt $Bitmap.Height; $y++) {
        for ($x = 0; $x -lt $Bitmap.Width; $x++) {
            $pixel = $Bitmap.GetPixel($x, $y)
            if ($pixel.A -gt $AlphaThreshold) {
                if ($x -lt $minX) { $minX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }

    if ($maxX -lt 0 -or $maxY -lt 0) {
        return New-Object System.Drawing.Rectangle(0, 0, $Bitmap.Width, $Bitmap.Height)
    }

    return New-Object System.Drawing.Rectangle($minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1))
}

function Save-ResizedPng {
    param(
        [System.Drawing.Bitmap]$SourceBitmap,
        [System.Drawing.Rectangle]$SourceBounds,
        [int]$Size,
        [string]$DestinationPath
    )

    $bitmap = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bitmap.SetResolution(96, 96)

    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

        $paddingRatio = if ($Size -le 32) { 0.02 } elseif ($Size -le 128) { 0.03 } else { 0.035 }
        $padding = [int][Math]::Round($Size * $paddingRatio)
        $available = $Size - ($padding * 2)

        $scale = [Math]::Min($available / $SourceBounds.Width, $available / $SourceBounds.Height)
        $drawWidth = [int][Math]::Round($SourceBounds.Width * $scale)
        $drawHeight = [int][Math]::Round($SourceBounds.Height * $scale)
        $drawX = [int][Math]::Round(($Size - $drawWidth) / 2)
        $drawY = [int][Math]::Round(($Size - $drawHeight) / 2)

        $destinationRect = New-Object System.Drawing.Rectangle($drawX, $drawY, $drawWidth, $drawHeight)
        $graphics.DrawImage($SourceBitmap, $destinationRect, $SourceBounds, [System.Drawing.GraphicsUnit]::Pixel)
        $bitmap.Save($DestinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Write-BigEndianUInt32 {
    param(
        [System.IO.BinaryWriter]$Writer,
        [uint32]$Value
    )

    $Writer.Write([byte](($Value -shr 24) -band 0xFF))
    $Writer.Write([byte](($Value -shr 16) -band 0xFF))
    $Writer.Write([byte](($Value -shr 8) -band 0xFF))
    $Writer.Write([byte]($Value -band 0xFF))
}

$sourceBitmap = [System.Drawing.Bitmap]::FromFile($sourcePath)
try {
    $sourceBounds = Get-OpaqueBounds -Bitmap $sourceBitmap

    foreach ($size in $sizes) {
        $pngPath = Join-Path $outputDir ("icon-{0}.png" -f $size)
        Save-ResizedPng -SourceBitmap $sourceBitmap -SourceBounds $sourceBounds -Size $size -DestinationPath $pngPath
    }
}
finally {
    $sourceBitmap.Dispose()
}

Copy-Item (Join-Path $outputDir 'icon-512.png') (Join-Path $outputDir 'icon.png') -Force

$icoPath = Join-Path $outputDir 'icon.ico'
$icoSizes = @(16, 32, 64, 128, 256)
$icoEntries = foreach ($size in $icoSizes) {
    $path = Join-Path $outputDir ("icon-{0}.png" -f $size)
    [pscustomobject]@{
        Size = $size
        Bytes = [System.IO.File]::ReadAllBytes($path)
    }
}

$icoStream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
$icoWriter = New-Object System.IO.BinaryWriter($icoStream)
try {
    $icoWriter.Write([UInt16]0)
    $icoWriter.Write([UInt16]1)
    $icoWriter.Write([UInt16]$icoEntries.Count)

    $offset = 6 + (16 * $icoEntries.Count)
    foreach ($entry in $icoEntries) {
        $dimension = if ($entry.Size -ge 256) { 0 } else { $entry.Size }
        $icoWriter.Write([byte]$dimension)
        $icoWriter.Write([byte]$dimension)
        $icoWriter.Write([byte]0)
        $icoWriter.Write([byte]0)
        $icoWriter.Write([UInt16]1)
        $icoWriter.Write([UInt16]32)
        $icoWriter.Write([UInt32]$entry.Bytes.Length)
        $icoWriter.Write([UInt32]$offset)
        $offset += $entry.Bytes.Length
    }

    foreach ($entry in $icoEntries) {
        $icoWriter.Write($entry.Bytes)
    }
}
finally {
    $icoWriter.Dispose()
    $icoStream.Dispose()
}

$icnsPath = Join-Path $outputDir 'icon.icns'
$icnsMap = [ordered]@{
    16 = 'icp4'
    32 = 'icp5'
    64 = 'icp6'
    128 = 'ic07'
    256 = 'ic08'
    512 = 'ic09'
    1024 = 'ic10'
}
$icnsChunks = New-Object System.Collections.Generic.List[byte[]]
$totalSize = 8

foreach ($entry in $icnsMap.GetEnumerator()) {
    $pngPath = Join-Path $outputDir ("icon-{0}.png" -f $entry.Key)
    $pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
    $chunkLength = 8 + $pngBytes.Length
    $chunkBytes = New-Object byte[] $chunkLength
    $typeBytes = [System.Text.Encoding]::ASCII.GetBytes($entry.Value)
    [Array]::Copy($typeBytes, 0, $chunkBytes, 0, 4)
    $chunkBytes[4] = [byte](($chunkLength -shr 24) -band 0xFF)
    $chunkBytes[5] = [byte](($chunkLength -shr 16) -band 0xFF)
    $chunkBytes[6] = [byte](($chunkLength -shr 8) -band 0xFF)
    $chunkBytes[7] = [byte]($chunkLength -band 0xFF)
    [Array]::Copy($pngBytes, 0, $chunkBytes, 8, $pngBytes.Length)
    $icnsChunks.Add($chunkBytes)
    $totalSize += $chunkBytes.Length
}

$icnsStream = [System.IO.File]::Open($icnsPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
$icnsWriter = New-Object System.IO.BinaryWriter($icnsStream)
try {
    $icnsWriter.Write([System.Text.Encoding]::ASCII.GetBytes('icns'))
    Write-BigEndianUInt32 -Writer $icnsWriter -Value ([uint32]$totalSize)
    foreach ($chunk in $icnsChunks) {
        $icnsWriter.Write($chunk)
    }
}
finally {
    $icnsWriter.Dispose()
    $icnsStream.Dispose()
}

Write-Output "Generated icon set in $outputDir"
