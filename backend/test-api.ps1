# 测试聊天 API
$body = @{
    message = "你好"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/chat" -Method POST -ContentType "application/json" -Body $body
    Write-Host "成功！AI 回复:" -ForegroundColor Green
    Write-Host $response.reply
} catch {
    Write-Host "失败！错误信息:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.Exception.Response
}
