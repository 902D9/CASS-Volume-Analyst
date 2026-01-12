
import React, { useState, useCallback } from 'react';
import { FolderParser } from './services/FolderParser';
import { Gridifier } from './services/Gridifier';
import { VolumeCalculator } from './services/VolumeCalculator';
import { MeshData, VolumeResult } from './types';
import { AnalysisDashboard } from './components/AnalysisDashboard';
import { Visualizer } from './components/Visualizer';

const App: React.FC = () => {
  const [mesh1, setMesh1] = useState<MeshData | null>(null);
  const [mesh2, setMesh2] = useState<MeshData | null>(null);
  const [files1, setFiles1] = useState<File[]>([]);
  const [files2, setFiles2] = useState<File[]>([]);
  const [folderName1, setFolderName1] = useState<string>("");
  const [folderName2, setFolderName2] = useState<string>("");
  const [gridSize, setGridSize] = useState<number>(3.0); // 默认 3.0m
  const [result, setResult] = useState<VolumeResult | null>(null);
  const [status, setStatus] = useState<string>("");
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFolderSelection = (e: React.ChangeEvent<HTMLInputElement>, index: 1 | 2) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const allFiles = Array.from(fileList);
    const folderPath = allFiles[0].webkitRelativePath.split('/')[0] || "未命名";
    
    setError(null);
    setStatus("");
    
    if (index === 1) {
      setFiles1(allFiles);
      setFolderName1(folderPath);
      setMesh1(null);
    } else {
      setFiles2(allFiles);
      setFolderName2(folderPath);
      setMesh2(null);
    }
    setResult(null);
  };

  const validateAndProcess = async () => {
    if (files1.length === 0 || files2.length === 0) {
      setError("请先选择两个时期的文件夹。");
      return;
    }

    // 检查 metadata.xml 是否存在
    const hasMeta1 = files1.some(f => f.name.toLowerCase().endsWith('metadata.xml'));
    const hasMeta2 = files2.some(f => f.name.toLowerCase().endsWith('metadata.xml'));

    if (!hasMeta1 || !hasMeta2) {
      setError("文件夹中缺少 metadata.xml 文件。请确保文件夹结构完整（包含 CC/CASS 导出的元数据）。");
      return;
    }

    setCalculating(true);
    setError(null);

    try {
      // 1. 处理第一期
      setStatus("正在解析第一期元数据...");
      const meta1 = await FolderParser.parseMetadataOnly(files1);
      const objFiles1 = files1.filter(f => f.name.toLowerCase().endsWith('.obj'));
      
      if (objFiles1.length === 0) throw new Error("基础期文件夹内未找到 OBJ 文件。");
      
      const grid1 = await Gridifier.processFoldersToGrid(objFiles1, meta1, gridSize, setStatus);
      const m1: MeshData = { vertexGroups: [], name: folderName1, origin: meta1, grid: grid1 };
      setMesh1(m1);

      // 2. 处理第二期
      setStatus("正在解析第二期元数据...");
      const meta2 = await FolderParser.parseMetadataOnly(files2);
      const objFiles2 = files2.filter(f => f.name.toLowerCase().endsWith('.obj'));
      
      if (objFiles2.length === 0) throw new Error("对比期文件夹内未找到 OBJ 文件。");
      
      const grid2 = await Gridifier.processFoldersToGrid(objFiles2, meta2, gridSize, setStatus);
      const m2: MeshData = { vertexGroups: [], name: folderName2, origin: meta2, grid: grid2 };
      setMesh2(m2);

      setStatus("所有切片网格化预处理完成！");
    } catch (err) {
      console.error(err);
      setError(`处理过程中断: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setCalculating(false);
    }
  };

  const runAnalysis = useCallback(() => {
    if (!mesh1 || !mesh2) return;
    setCalculating(true);
    setStatus("执行方量对比算法...");
    setTimeout(() => {
      try {
        const volumeResult = VolumeCalculator.calculate(mesh1, mesh2, gridSize);
        setResult(volumeResult);
        setStatus("分析完成。");
      } catch (err) {
        setError(`计算失败: ${err instanceof Error ? err.message : '检查坐标系是否一致'}`);
      } finally {
        setCalculating(false);
      }
    }, 100);
  }, [mesh1, mesh2, gridSize]);

  return (
    <div className="flex h-screen w-full bg-slate-900 text-white overflow-hidden font-sans">
      <header className="absolute top-0 left-0 right-0 h-20 bg-slate-800/90 backdrop-blur-xl border-b border-slate-700 flex items-center px-6 z-20 justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black shadow-lg">C</div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">CASS-Pro</h1>
              <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Volume Analyst</span>
            </div>
          </div>
          
          <div className="h-8 w-px bg-slate-700 mx-2"></div>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <input 
                type="file" 
                {...({ webkitdirectory: "", directory: "" } as any)} 
                onChange={(e) => handleFolderSelection(e, 1)} 
                className="absolute inset-0 opacity-0 cursor-pointer z-10" 
              />
              <button className={`px-4 py-2 rounded-lg border text-xs transition-all ${files1.length > 0 ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 bg-slate-700'}`}>
                {folderName1 || "选择第一期(基础)"}
              </button>
            </div>
            <div className="relative group">
              <input 
                type="file" 
                {...({ webkitdirectory: "", directory: "" } as any)} 
                onChange={(e) => handleFolderSelection(e, 2)} 
                className="absolute inset-0 opacity-0 cursor-pointer z-10" 
              />
              <button className={`px-4 py-2 rounded-lg border text-xs transition-all ${files2.length > 0 ? 'border-red-500 bg-red-500/10' : 'border-slate-600 bg-slate-700'}`}>
                {folderName2 || "选择第二期(对比)"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {(!mesh1 || !mesh2) ? (
            <button 
              disabled={files1.length === 0 || files2.length === 0 || calculating}
              onClick={validateAndProcess}
              className="px-6 py-2.5 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {calculating ? "处理中..." : "开始网格化处理"}
            </button>
          ) : (
            <button 
              disabled={calculating}
              onClick={runAnalysis}
              className="px-6 py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-500 transition-all flex items-center gap-2"
            >
              {calculating ? "分析中..." : "开始方量对比"}
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-full z-50 shadow-2xl flex items-center gap-2 max-w-[80%] text-center">
          <span className="font-bold whitespace-nowrap">! 提示</span> 
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-4 font-black">×</button>
        </div>
      )}

      {status && !error && (
        <div className="absolute bottom-6 left-6 bg-slate-800/90 border border-slate-700 px-4 py-2 rounded-lg z-50 text-xs font-mono text-blue-400 shadow-2xl flex items-center gap-2">
          {calculating && <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>}
          {status}
        </div>
      )}

      <main className="flex-1 relative mt-20 flex overflow-hidden">
        <Visualizer mesh1={mesh1} mesh2={mesh2} result={result} />
        <AnalysisDashboard 
          result={result} 
          loading={calculating} 
          gridSize={gridSize}
          onGridSizeChange={setGridSize}
        />
      </main>
    </div>
  );
};

export default App;
