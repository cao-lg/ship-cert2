import React, { useEffect, useRef, useState } from 'react';
import { Copy, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { logger, LogItem } from '@/utils/logger';

export default function LogPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>(logger.getLogs());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = logger.subscribe(setLogs);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLevelColor = (level: LogItem['level']) => {
    switch (level) {
      case 'error': return 'text-red-500';
      case 'warn': return 'text-amber-500';
      case 'debug': return 'text-gray-400';
      default: return 'text-green-600';
    }
  };

  const getLevelBg = (level: LogItem['level']) => {
    switch (level) {
      case 'error': return 'bg-red-50';
      case 'warn': return 'bg-amber-50';
      case 'debug': return 'bg-gray-50';
      default: return 'bg-green-50';
    }
  };

  const handleCopy = () => {
    const text = logs.map((log) => `[${log.level.toUpperCase()}] ${log.timestamp} - ${log.message}`).join('\n');
    navigator.clipboard.writeText(text).catch(console.error);
  };

  return (
    <div className="w-full bg-gray-50 border-t border-gray-200">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-600">调试日志</span>
          <span className="text-xs bg-gray-300 text-gray-600 px-1.5 py-0.5 rounded-full">
            {logs.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-1.5 hover:bg-gray-200 rounded transition-colors"
            title="复制日志"
          >
            <Copy className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={() => logger.clear()}
            className="p-1.5 hover:bg-gray-200 rounded transition-colors"
            title="清空日志"
          >
            <Trash2 className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 hover:bg-gray-200 rounded transition-colors"
          >
            {collapsed ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronUp className="w-4 h-4 text-gray-500" />}
          </button>
        </div>
      </div>
      
      {!collapsed && (
        <div
          ref={scrollRef}
          className="h-48 overflow-y-auto p-3 space-y-1 text-xs font-mono"
        >
          {logs.length === 0 ? (
            <div className="text-gray-400 text-center py-4">暂无日志</div>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                className={`px-2 py-1 rounded ${getLevelBg(log.level)}`}
              >
                <span className="text-gray-400 mr-2">[{log.timestamp}]</span>
                <span className={`font-semibold mr-1 ${getLevelColor(log.level)}`}>
                  {log.level.toUpperCase()}
                </span>
                <span className="text-gray-700">{log.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
