"$filePath = 'private/pages/pages/labreport.js'
$lines = [System.IO.File]::ReadAllLines($filePath)

$startIdx = -1
$endIdx = -1
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '// IST offset in ms: UTC \+ 5:30') {
        $startIdx = $i
        break
    }
}

for ($i = $startIdx; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match 'const parsedDate = new Date\(rawValue\);' -and $i -gt $startIdx + 5) {
        $endIdx = $i
        break
    }
}

Write-Host \"Found section from line $($startIdx+1) to line $($endIdx+1)\"

$newLines = @(
    '',
    '        const isoDateMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})T/);',
    '        if (isoDateMatch && timeMatch) {',
    '            const [, year, month, day] = isoDateMatch;',
    '            return new Date(Number(year), Number(month) - 1, Number(day), fallbackHours, fallbackMinutes);',
    '        }',
    '',
    '        const ymdMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);',
    '        if (ymdMatch) {',
    '            const [, year, month, day] = ymdMatch;',
    '            return new Date(Number(year), Number(month) - 1, Number(day), fallbackHours, fallbackMinutes);',
    '        }',
    '',
    '        const dmyMatch = rawValue.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);',
    '        if (dmyMatch) {',
    '            const [, day, month, year] = dmyMatch;',
    '            return new Date(Number(year), Number(month) - 1, Number(day), fallbackHours, fallbackMinutes);',
    '        }',
    ''
)

$newContent = @()
$newContent += $lines[0..($startIdx-1)]
$newContent += $newLines
$newContent += $lines[$endIdx..($lines.Length-1)]

[System.IO.File]::WriteAllLines($filePath, $newContent)
Write-Host 'Done! Replaced lines with original parseDateInput logic'"