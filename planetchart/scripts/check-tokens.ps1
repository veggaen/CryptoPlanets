$response = Invoke-RestMethod -Uri "http://localhost:3000/api/galaxy?mode=MarketCap&hideStables=true&hideWrapped=true" -Method Get

Write-Host "=== Token Summary ===" -ForegroundColor Cyan

foreach ($chain in $response.data.chains) {
    Write-Host "`n$($chain.name) ($($chain.id)) - $($chain.tokens.Count) tokens:" -ForegroundColor Yellow
    foreach ($token in $chain.tokens) {
        $mc = if ($token.marketCap) { [math]::Round($token.marketCap / 1000000, 1) } else { 0 }
        Write-Host "  $($token.symbol) - $mc M" -ForegroundColor White
    }
}
