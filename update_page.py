import re

with open('src/app/page.tsx', 'r') as f:
    content = f.read()

# Add imports
content = content.replace("import {\n  type DashboardData,", "import { getSystemInfo, type SystemInfo } from '@/lib/sys';\nimport {\n  type DashboardData,")

# Add state
content = content.replace(
    "const [remoteStatus, setRemoteStatus] = useState<{ ahead: number; behind: number; lastCommitTime: string } | null>(null);",
    "const [remoteStatus, setRemoteStatus] = useState<{ ahead: number; behind: number; lastCommitTime: string } | null>(null);\n  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);"
)

# Add polling
polling_effect = """
  useEffect(() => {
    let mounted = true;

    const fetchSysInfo = async () => {
      try {
        const info = await getSystemInfo();
        if (mounted) {
          setSysInfo(info);
        }
      } catch (err) {
        console.error('Failed to get system info:', err);
      }
    };

    fetchSysInfo();
    const interval = setInterval(fetchSysInfo, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return { value: 0, unit: 'B' };
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return {
      value: parseFloat((bytes / Math.pow(k, i)).toFixed(1)),
      unit: sizes[i]
    };
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / (3600 * 24));
    if (days > 0) return { value: days, unit: '天' };
    const hours = Math.floor(seconds % (3600 * 24) / 3600);
    if (hours > 0) return { value: hours, unit: '小时' };
    const minutes = Math.floor(seconds % 3600 / 60);
    return { value: minutes, unit: '分钟' };
  };
"""

content = content.replace(
    "return () => {\n      mounted = false;\n      unlisten?.();\n    };\n  }, []);",
    "return () => {\n      mounted = false;\n      unlisten?.();\n    };\n  }, []);\n" + polling_effect
)

# Update Last Commit to Uptime
content = re.sub(
    r'<div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm outline outline-1 outline-outline-variant/15 col-span-2 lg:col-span-1 flex flex-col justify-center relative overflow-hidden group">[\s\S]*?<p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-1">最后提交记录</p>[\s\S]*?<h4 className="text-xl font-headline font-bold text-on-surface truncate pr-4" title=\{remoteStatus\?\.lastCommitTime \|\| \'-\'\}\>\{remoteStatus\?\.lastCommitTime\?\.split\(\' \'\)\[0\] \|\| \'-\'\}</h4>[\s\S]*?<p className="text-xs text-on-surface-variant mt-2">远程仓库更新</p>[\s\S]*?</div>',
    """<div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm outline outline-1 outline-outline-variant/15 col-span-2 lg:col-span-1 flex flex-col justify-center relative overflow-hidden group">
                <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <span className="material-symbols-outlined text-9xl text-emerald-500">schedule</span>
                </div>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-1">系统正常运行时间</p>
                <h4 className="text-3xl font-headline font-bold text-on-surface">{sysInfo ? formatUptime(sysInfo.uptime).value : '-'} <span className="text-lg text-on-surface-variant font-semibold">{sysInfo ? formatUptime(sysInfo.uptime).unit : ''}</span></h4>
                <p className="text-xs text-on-surface-variant mt-2">自上次重启</p>
              </div>""",
    content
)

# Update Database Size (Total Disk)
content = re.sub(
    r'<div className="flex items-center space-x-2 mb-2">\s*<span className="material-symbols-outlined text-amber-500 text-sm">database</span>\s*<p className="text-sm font-semibold text-amber-600 dark:text-amber-400">数据库大小 \(估算\)</p>\s*</div>\s*<h4 className="text-2xl font-headline font-bold text-on-surface mb-1">1\.4 <span className="text-sm text-on-surface-variant font-semibold">TB</span></h4>\s*<div className="w-full bg-surface-container-high rounded-full h-1\.5 mt-2">\s*<div className="bg-amber-500 h-1\.5 rounded-full" style=\{\{ width: "45%" \}\}></div>\s*</div>',
    """<div className="flex items-center space-x-2 mb-2">
                  <span className="material-symbols-outlined text-amber-500 text-sm">database</span>
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">数据库大小 (估算)</p>
                </div>
                <h4 className="text-2xl font-headline font-bold text-on-surface mb-1">
                  {sysInfo ? formatBytes(sysInfo.diskTotal * 0.15).value : '-'} <span className="text-sm text-on-surface-variant font-semibold">{sysInfo ? formatBytes(sysInfo.diskTotal * 0.15).unit : ''}</span>
                </h4>
                <div className="w-full bg-surface-container-high rounded-full h-1.5 mt-2">
                  <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: "45%" }}></div>
                </div>""",
    content
)

# Update CPU
content = re.sub(
    r'<div className="flex items-center space-x-2 mb-2">\s*<span className="material-symbols-outlined text-rose-500 text-sm">memory</span>\s*<p className="text-sm font-semibold text-rose-600 dark:text-rose-400">CPU 使用率 \(宿主机\)</p>\s*</div>\s*<div className="flex items-baseline space-x-1 mb-1">\s*<h4 className="text-2xl font-headline font-bold text-on-surface">42%</h4>\s*</div>\s*<div className="w-full bg-surface-container-high rounded-full h-1\.5 mt-2">\s*<div className="bg-rose-500 h-1\.5 rounded-full" style=\{\{ width: "42%" \}\}></div>\s*</div>',
    """<div className="flex items-center space-x-2 mb-2">
                  <span className="material-symbols-outlined text-rose-500 text-sm">memory</span>
                  <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">CPU 使用率</p>
                </div>
                <div className="flex items-baseline space-x-1 mb-1">
                  <h4 className="text-2xl font-headline font-bold text-on-surface">{sysInfo ? sysInfo.cpuUsage.toFixed(0) : '-'}%</h4>
                </div>
                <div className="w-full bg-surface-container-high rounded-full h-1.5 mt-2">
                  <div className="bg-rose-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${sysInfo ? Math.min(100, Math.max(0, sysInfo.cpuUsage)) : 0}%` }}></div>
                </div>""",
    content
)

# Update Memory
content = re.sub(
    r'<div className="flex items-center space-x-2 mb-2">\s*<span className="material-symbols-outlined text-purple-500 text-sm">memory_alt</span>\s*<p className="text-sm font-semibold text-purple-600 dark:text-purple-400">内存使用情况</p>\s*</div>\s*<h4 className="text-2xl font-headline font-bold text-on-surface mb-1">64 <span className="text-sm text-on-surface-variant font-semibold">GB</span></h4>\s*<p className="text-xs text-on-surface-variant mt-1">/ 128 GB 总计</p>\s*<div className="w-full bg-surface-container-high rounded-full h-1\.5 mt-2">\s*<div className="bg-purple-500 h-1\.5 rounded-full" style=\{\{ width: "50%" \}\}></div>\s*</div>',
    """<div className="flex items-center space-x-2 mb-2">
                  <span className="material-symbols-outlined text-purple-500 text-sm">memory_alt</span>
                  <p className="text-sm font-semibold text-purple-600 dark:text-purple-400">内存使用情况</p>
                </div>
                <h4 className="text-2xl font-headline font-bold text-on-surface mb-1">
                  {sysInfo ? formatBytes(sysInfo.memoryUsed).value : '-'} <span className="text-sm text-on-surface-variant font-semibold">{sysInfo ? formatBytes(sysInfo.memoryUsed).unit : ''}</span>
                </h4>
                <p className="text-xs text-on-surface-variant mt-1">/ {sysInfo ? `${formatBytes(sysInfo.memoryTotal).value} ${formatBytes(sysInfo.memoryTotal).unit}` : '-'} 总计</p>
                <div className="w-full bg-surface-container-high rounded-full h-1.5 mt-2">
                  <div className="bg-purple-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${sysInfo && sysInfo.memoryTotal > 0 ? (sysInfo.memoryUsed / sysInfo.memoryTotal) * 100 : 0}%` }}></div>
                </div>""",
    content
)

# Update Disk
content = re.sub(
    r'<div className="flex items-center space-x-2">\s*<span className="material-symbols-outlined text-cyan-500 text-sm">hard_drive</span>\s*<p className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">磁盘空间</p>\s*</div>\s*<p className="text-xs font-semibold text-on-surface-variant">10 TB 总计</p>\s*</div>\s*<div className="flex items-end justify-between mb-2">\s*<h4 className="text-3xl font-headline font-bold text-on-surface">4\.2 <span className="text-base text-on-surface-variant font-semibold">TB 可用</span></h4>\s*<span className="text-sm font-semibold text-on-surface">58% 已用</span>\s*</div>\s*<div className="w-full bg-surface-container-high rounded-full h-2 mt-1">\s*<div className="bg-cyan-500 h-2 rounded-full" style=\{\{ width: "58%" \}\}></div>\s*</div>',
    """<div className="flex items-center space-x-2">
                    <span className="material-symbols-outlined text-cyan-500 text-sm">hard_drive</span>
                    <p className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">磁盘空间</p>
                  </div>
                  <p className="text-xs font-semibold text-on-surface-variant">{sysInfo ? `${formatBytes(sysInfo.diskTotal).value} ${formatBytes(sysInfo.diskTotal).unit}` : '-'} 总计</p>
                </div>
                <div className="flex items-end justify-between mb-2">
                  <h4 className="text-3xl font-headline font-bold text-on-surface">{sysInfo ? formatBytes(sysInfo.diskAvailable).value : '-'} <span className="text-base text-on-surface-variant font-semibold">{sysInfo ? formatBytes(sysInfo.diskAvailable).unit : ''} 可用</span></h4>
                  <span className="text-sm font-semibold text-on-surface">{sysInfo && sysInfo.diskTotal > 0 ? ((sysInfo.diskTotal - sysInfo.diskAvailable) / sysInfo.diskTotal * 100).toFixed(0) : 0}% 已用</span>
                </div>
                <div className="w-full bg-surface-container-high rounded-full h-2 mt-1">
                  <div className="bg-cyan-500 h-2 rounded-full transition-all duration-500" style={{ width: `${sysInfo && sysInfo.diskTotal > 0 ? ((sysInfo.diskTotal - sysInfo.diskAvailable) / sysInfo.diskTotal * 100) : 0}%` }}></div>
                </div>""",
    content
)


with open('src/app/page.tsx', 'w') as f:
    f.write(content)
