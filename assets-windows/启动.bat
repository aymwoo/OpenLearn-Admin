@echo off
setlocal

echo 正在启动 MyWebServer (ASP.NET 4.8)...

:: 切换到服务器所在目录以确保配置文件 (Config.ini) 正确加载
cd /d "assets-windows\MyWebServer"

if not exist "MyWebServer.exe" (
    echo 错误: 未找到 MyWebServer.exe，请先运行 安装环境.bat
    pause
    exit /b
)

:: 启动 MyWebServer 并保持批处理运行，以便 Tauri 可以管理进程
:: /p: 端口 (Port)
:: /r: 根目录 (Root)
:: /d: 默认文档 (Default Document)
:: 不使用 start 命令，直接运行以阻塞进程
"MyWebServer.exe" /p:8000 /r:"..\LearnSite" /d:index.aspx

echo Web 服务已停止。
