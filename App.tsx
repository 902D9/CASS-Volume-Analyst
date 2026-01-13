
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FolderParser } from './services/FolderParser';
import { Gridifier } from './services/Gridifier';
import { VolumeCalculator } from './services/VolumeCalculator';
import { BoundaryParser } from './services/BoundaryParser';
import { MeshData, VolumeResult, GridData, BoundaryPoint, Point3D } from './types';
import { AnalysisDashboard } from './components/AnalysisDashboard';
import { Visualizer } from './components/Visualizer';

const DB_NAME = 'CASS_PRO_CACHE_DB';
const STORE_NAME = 'cached_grids';

async function cacheGrid(key: string, grid: GridData) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(grid, key);
}

async function getCachedGrid(key: string): Promise<GridData | null> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const App: React.FC = () => {
  const [mesh1, setMesh1] = useState<MeshData | null>(null);
  const [mesh2, setMesh2] = useState<MeshData | null>(null);
  const [boundary, setBoundary] = useState<BoundaryPoint[] | null>(null);
  const [files1, setFiles1] = useState<File[]>([]);
  const [files2, setFiles2] = useState<File[]>([]);
  const [folderName1, setFolderName1] = useState<string>("");
  const [folderName2, setFolderName2] = useState<string>("");
  const [gridSize, setGridSize] = useState<number>(3.0);
  const [result, setResult] = useState<VolumeResult | null>(null);
  const [status, setStatus] = useState<string>("");
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);
  const boundaryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadCache() {
      const g1 = await getCachedGrid('grid1');
      const g2 = await getCachedGrid('grid2');
      if (g1) {
        setMesh1({ vertexGroups: [], name: "缓存数据 - 第一期", origin: g1.anchor, grid: g1 });
        setFolderName1("缓存 - 第一期");
      }
      if (g2) {
        setMesh2({ vertexGroups: [], name: "缓存数据 - 第二期", origin: g2.anchor, grid: g2 });
        setFolderName2("缓存 - 第二期");
      }
      if (g1 || g2) setStatus("已恢复上次处理好的格网数据。");
    }
    loadCache();
  }, []);

  const handleStandardInput = (e: React.ChangeEvent<HTMLInputElement>, index: 1 | 2) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const allFiles = Array.from(fileList);
    const path = allFiles[0].webkitRelativePath.split('/')[0] || "文件夹";
    if (index === 1) { setFiles1(allFiles); setFolderName1(path); setMesh1(null); }
    else { setFiles2(allFiles); setFolderName2(path); setMesh2(null); }
    setError(null);
    setResult(null);
  };

  // Fix for error: Cannot find name 'selectFolder'
  const selectFolder = (index: 1 | 2) => {
    if (index === 1) {
      fileInputRef1.current?.click();
    } else {
      fileInputRef2.current?.click();
    }
  };

  const handleBoundaryInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const pts = await BoundaryParser.parseCSV(file);
      setBoundary(pts);
      setStatus(`成功导入矿界：${pts.length} 个拐点。请重新解析 OBJ 文件以对齐网格。`);
      setResult(null); 
    } catch (err) {
      setError("矿界 CSV 解析失败。");
    }
  };

  const processFiles = async () => {
    if (files1.length === 0 && files2.length === 0) return;
    setCalculating(true);
    setError(null);

    try {
      if (files1.length > 0) {
        setStatus("正在解析第一期 (对齐矿界)...");
        const meta1 = await FolderParser.parseMetadataOnly(files1);
        const objs1 = files1.filter(f => f.name.toLowerCase().endsWith('.obj'));
        const g1 = await Gridifier.processFoldersToGrid(objs1, meta1, gridSize, boundary, setStatus);
        await cacheGrid('grid1', g1);
        setMesh1({ vertexGroups: [], name: folderName1, origin: g1.anchor, grid: g1 });
        setFiles1([]); 
      }

      if (files2.length > 0) {
        setStatus("正在解析第二期 (对齐矿界)...");
        const meta2 = await FolderParser.parseMetadataOnly(files2);
        const objs2 = files2.filter(f => f.name.toLowerCase().endsWith('.obj'));
        const g2 = await Gridifier.processFoldersToGrid(objs2, meta2, gridSize, boundary, setStatus);
        await cacheGrid('grid2', g2);
        setMesh2({ vertexGroups: [], name: folderName2, origin: g2.anchor, grid: g2 });
        setFiles2([]);
      }

      setStatus("对齐式网格化处理完成！");
    } catch (err) {
      setError(`处理失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setCalculating(false);
    }
  };

  const runAnalysis = useCallback(() => {
    if (!mesh1?.grid || !mesh2?.grid) {
      setError("请先解析并完成两期数据的网格化。");
      return;
    }
    if (!boundary || boundary.length < 3) {
      setError("请先导入矿界 CSV 文件。");
      return;
    }

    setCalculating(true);
    setStatus("执行 CASS 碎面裁剪方量对比...");
    setError(null);

    setTimeout(() => {
      try {
        const volumeResult = VolumeCalculator.calculate(mesh1, mesh2, boundary, gridSize);
        setResult(volumeResult);
        setStatus("对齐边界分析完成。");
      } catch (err) {
        setError(`对比失败: ${err instanceof Error ? err.message : '检查数据范围'}`);
      } finally {
        setCalculating(false);
      }
    }, 100);
  }, [mesh1, mesh2, boundary, gridSize]);

  const clearCache = async () => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    window.location.reload();
  };

  return (
    <div className="flex h-screen w-full bg-slate-900 text-white overflow-hidden font-sans">
      <input type="file" ref={fileInputRef1} className="hidden" {...({ webkitdirectory: "", directory: "" } as any)} onChange={(e) => handleStandardInput(e, 1)} />
      <input type="file" ref={fileInputRef2} className="hidden" {...({ webkitdirectory: "", directory: "" } as any)} onChange={(e) => handleStandardInput(e, 2)} />
      <input type="file" ref={boundaryInputRef} className="hidden" accept=".csv" onChange={handleBoundaryInput} />
      
      {calculating && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex flex-col items-center justify-center">
          <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-6"></div>
          <div className="bg-slate-800 border border-slate-700 px-8 py-4 rounded-2xl shadow-2xl text-center">
            <h3 className="text-xl font-bold mb-2 tracking-tight italic">CASS Pro Algorithm Core</h3>
            <p className="text-blue-400 font-mono text-sm">{status}</p>
          </div>
        </div>
      )}

      <header className="absolute top-0 left-0 right-0 h-20 bg-slate-800/90 backdrop-blur-xl border-b border-slate-700 flex items-center px-6 z-20 justify-between shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black shadow-lg shadow-indigo-500/20">C</div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">CASS-Pro</h1>
              <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest block">DTM-GRID Processor</span>
            </div>
          </div>
          <div className="h-8 w-px bg-slate-700 mx-2"></div>
          <div className="flex items-center gap-3">
            <button onClick={() => boundaryInputRef.current?.click()} className={`px-4 py-2 rounded-lg border text-xs transition-all flex items-center gap-2 ${boundary ? 'border-yellow-500 bg-yellow-500/10' : 'border-slate-600 bg-slate-700'}`}>
              <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
              {boundary ? "矿界已导入 (已对齐)" : "1. 导入矿界 (基准)"}
            </button>
            <button onClick={() => selectFolder(1)} className={`px-4 py-2 rounded-lg border text-xs transition-all flex items-center gap-2 ${mesh1 ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 bg-slate-700'}`}>
              {folderName1 || "2. 第一期 (基础)"}
            </button>
            <button onClick={() => selectFolder(2)} className={`px-4 py-2 rounded-lg border text-xs transition-all flex items-center gap-2 ${mesh2 ? 'border-red-500 bg-red-500/10' : 'border-slate-600 bg-slate-700'}`}>
              {folderName2 || "3. 第二期 (对比)"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {(files1.length > 0 || files2.length > 0) && (
            <button onClick={processFiles} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all">
              生成对齐网格
            </button>
          )}
          {mesh1 && mesh2 && (
            <button onClick={runAnalysis} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20">
              精确方量对比
            </button>
          )}
          <button onClick={clearCache} className="p-2 rounded-lg text-slate-500 hover:text-white transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
        </div>
      </header>

      <main className="flex-1 relative mt-20 flex overflow-hidden">
        <Visualizer mesh1={mesh1} mesh2={mesh2} result={result} boundary={boundary} />
        <AnalysisDashboard result={result} loading={calculating} gridSize={gridSize} onGridSizeChange={setGridSize} />
      </main>

      {error && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-600/90 backdrop-blur text-white px-6 py-3 rounded-xl z-50 shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-300">
          <span className="font-bold">{error}</span>
          <button onClick={() => setError(null)} className="ml-4 hover:bg-white/20 rounded-full p-1">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;
