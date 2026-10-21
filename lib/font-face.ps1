param([Parameter(Mandatory=$true)][string]$Family)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName PresentationCore
function Read-At($stream, [long]$offset, [int]$count) {
    if ($offset -lt 0 -or $count -lt 0 -or $offset + $count -gt $stream.Length) { throw 'Invalid font table' }
    [void]$stream.Seek($offset, [System.IO.SeekOrigin]::Begin)
    $buffer = New-Object byte[] $count
    $read = 0
    while ($read -lt $count) {
        $n = $stream.Read($buffer, $read, $count - $read)
        if ($n -eq 0) { throw 'Incomplete font table' }
        $read += $n
    }
    return ,$buffer
}
function U16($bytes, [int]$at) { return ([int]$bytes[$at] * 256 + [int]$bytes[$at + 1]) }
function U32($bytes, [int]$at) { return ([long](U16 $bytes $at) * 65536 + (U16 $bytes ($at + 2))) }
$typeface = [System.Windows.Media.Typeface]::new($Family)
$glyph = $null
if (-not $typeface.TryGetGlyphTypeface([ref]$glyph)) { throw 'Font face not found' }
$names = [System.Collections.Generic.List[string]]::new()
$stream = $glyph.GetFontStream()
try {
    $header = Read-At $stream 0 12
    # Collection fonts already match through their normal family name. Do not
    # accidentally bind another face from a TTC to the selected family.
    if ([System.Text.Encoding]::ASCII.GetString($header, 0, 4) -ne 'ttcf') {
        $count = U16 $header 4
        if ($count -gt 256) { throw 'Too many font tables' }
        $directory = Read-At $stream 12 ($count * 16)
        for ($i = 0; $i -lt $count; $i++) {
            $at = $i * 16
            if ([System.Text.Encoding]::ASCII.GetString($directory, $at, 4) -ne 'name') { continue }
            $offset = U32 $directory ($at + 8)
            $length = U32 $directory ($at + 12)
            if ($length -gt 4194304) { throw 'Font name table too large' }
            $table = Read-At $stream $offset $length
            $records = U16 $table 2
            $strings = U16 $table 4
            if (6 + $records * 12 -gt $table.Length) { throw 'Invalid name records' }
            foreach ($wanted in @(6, 4)) {
                for ($r = 0; $r -lt $records; $r++) {
                    $p = 6 + $r * 12
                    $platform = U16 $table $p
                    $language = U16 $table ($p + 4)
                    if ((U16 $table ($p + 6)) -ne $wanted) { continue }
                    if ($platform -ne 0 -and -not ($platform -eq 3 -and ($wanted -eq 6 -or $language -eq 1033))) { continue }
                    $size = U16 $table ($p + 8)
                    $start = $strings + (U16 $table ($p + 10))
                    if ($start + $size -gt $table.Length) { throw 'Invalid name string' }
                    $name = [System.Text.Encoding]::BigEndianUnicode.GetString($table, $start, $size)
                    if ($name -and -not $names.Contains($name)) { $names.Add($name) }
                }
            }
        }
    }
} finally { $stream.Dispose() }
foreach ($name in $glyph.Win32FamilyNames.Values) {
    if ($name -and -not $names.Contains($name)) { $names.Add($name) }
}
[pscustomobject]@{ family=$Family; localNames=@($names.ToArray()) } | ConvertTo-Json -Compress -Depth 3
