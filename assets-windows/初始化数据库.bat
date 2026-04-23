@echo off
setlocal enabledelayedexpansion

echo [数据库初始化] 正在读取配置...

set "CONFIG_PATH=assets-windows\LearnSite\web.config"
if not exist "%CONFIG_PATH%" (
    echo [错误] 未找到 web.config: %CONFIG_PATH%
    exit /b 1
)

:: 使用 PowerShell 提取连接字符串
for /f "usebackq tokens=*" %%a in (`powershell -Command "[xml]$xml = Get-Content '%CONFIG_PATH%'; $xml.configuration.connectionStrings.add | Where-Object { $_.name -eq 'SqlServer' } | Select-Object -ExpandProperty connectionString"`) do (
    set "CONN_STR=%%a"
)

if "!CONN_STR!"=="" (
    echo [错误] 无法在 web.config 中找到名为 'SqlServer' 的连接字符串
    exit /b 1
)

echo [数据库初始化] 目标连接字符串: !CONN_STR!

:: 如果连接字符串包含 LocalDB，尝试启动 LocalDB 实例
echo !CONN_STR! | findstr /i "localdb" >nul
if %ERRORLEVEL% equ 0 (
    echo [数据库初始化] 检测到 LocalDB，正在确保实例已启动...
    sqllocaldb start MSSQLLocalDB >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        sqllocaldb create MSSQLLocalDB >nul 2>&1
        sqllocaldb start MSSQLLocalDB >nul 2>&1
    )
)

:: 使用 PowerShell 执行数据库创建逻辑
echo [数据库初始化] 正在验证并创建数据库...
powershell -Command ^
    "$connStr = '!CONN_STR!';" ^
    "try {" ^
    "  $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder($connStr);" ^
    "  $server = $builder.DataSource;" ^
    "  $dbName = $builder.InitialCatalog;" ^
    "  Write-Host \"[信息] 服务器: $server, 数据库: $dbName\";" ^
    "  $masterConnStr = $connStr.Replace($dbName, 'master');" ^
    "  $conn = New-Object System.Data.SqlClient.SqlConnection($masterConnStr);" ^
    "  $conn.Open();" ^
    "  $cmd = $conn.CreateCommand();" ^
    "  $cmd.CommandText = \"IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '$dbName') BEGIN CREATE DATABASE [$dbName] END\";" ^
    "  $cmd.ExecuteNonQuery();" ^
    "  $conn.Close();" ^
    "  Write-Host '[成功] 数据库已就绪。';" ^
    "} catch {" ^
    "  Write-Host \"[错误] 数据库初始化失败: $($_.Exception.Message)\";" ^
    "  exit 1;" ^
    "}"

if %ERRORLEVEL% neq 0 (
    echo [错误] 数据库初始化过程中出现问题。
    exit /b 1
)

exit /b 0
