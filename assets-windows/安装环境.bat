@echo off
setlocal enabledelayedexpansion

echo [1/4] 正在安装 .NET Framework 4.8...
if exist "assets-windows\Install\NDP48-x86-x64-AllOS-ENU.exe" (
    echo [信息] 启动 .NET 4.8 静默安装...
    start /wait "" "assets-windows\Install\NDP48-x86-x64-AllOS-ENU.exe" /q /norestart
    echo [成功] .NET 4.8 安装指令已执行完毕
) else (
    echo [错误] 未找到 .NET 4.8 安装包: assets-windows\Install\NDP48-x86-x64-AllOS-ENU.exe
)

echo [2/4] 正在安装 SQL Server 2022 Express...
if exist "assets-windows\Install\SQL2022-SSEI-Expr.exe" (
    echo [信息] 正在启动 SQL Server Express 2022 安装程序 (SSEI)...
    start /wait "" "assets-windows\Install\SQL2022-SSEI-Expr.exe" /Action=Install /IAcceptSqlServerLicenseTerms /QS /FEATURES=SQL /INSTANCENAME=SQLEXPRESS
    echo [成功] SQL Server 安装指令已发出
) else (
    echo [错误] 未找到 SQL Server 安装包: assets-windows\Install\SQL2022-SSEI-Expr.exe
)

echo [3/4] 准备 MyWebServer 环境...
if exist "assets-windows\Install\MyWebServer.exe" (
    if not exist "assets-windows\MyWebServer" mkdir "assets-windows\MyWebServer"
    copy "assets-windows\Install\MyWebServer.exe" "assets-windows\MyWebServer\MyWebServer.exe" /Y >nul
    echo [成功] MyWebServer 已就绪
) else (
    echo [错误] 未找到 Web 服务器程序: assets-windows\Install\MyWebServer.exe
)

echo [4/4] 初始化配置...
if not exist "assets-windows\Config" mkdir "assets-windows\Config"
echo [成功] 环境配置目录已创建。

echo ==========================================
echo 一键安装环境流程执行完毕（不包含源码克隆）。
echo 请在管理界面中完成仓库配置与同步。
echo ==========================================
