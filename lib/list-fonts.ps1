$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Drawing
$fontCollection = New-Object System.Drawing.Text.InstalledFontCollection
try {
    $fontRecords = @(
        foreach ($family in $fontCollection.Families) {
            [pscustomobject]@{
                family = $family.Name
                aliases = @($family.GetName(0x411), $family.GetName(0x409)) | Select-Object -Unique
            }
        }
    )
    ConvertTo-Json -InputObject $fontRecords -Compress -Depth 3
} finally {
    $fontCollection.Dispose()
}
