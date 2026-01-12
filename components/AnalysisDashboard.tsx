
import React from 'react';
import { VolumeResult } from '../types';

interface Props {
  result: VolumeResult | null;
  loading: boolean;
  onGridSizeChange: (size: number) => void;
  gridSize: number;
}

export const AnalysisDashboard: React.FC<Props> = ({ result, loading, onGridSizeChange, gridSize }) => {
  return (
    <div className="flex flex-col h-full bg-slate-800 border-l border-slate-700 w-80 p-6 overflow-y-auto">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
        <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        CASS 分析面板
      </h2>

      <div className="space-y-6">
        <section>
          <label className="block text-sm font-medium text-slate-400 mb-2">方格网间距 (Grid Size)</label>
          <div className="flex items-center gap-4">
            <input 
              type="range" 
              min="0.5" 
              max="10.0" 
              step="0.5" 
              value={gridSize}
              onChange={(e) => onGridSizeChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <span className="text-sm font-mono bg-slate-700 px-2 py-1 rounded w-12 text-center">{gridSize.toFixed(1)}m</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">提示：大规模场景推荐 3.0m - 5.0m 间距，以兼顾性能与精度。</p>
        </section>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-sm text-slate-400 font-medium animate-pulse text-center">正在处理海量顶点...<br/>请勿关闭浏览器</p>
          </div>
        ) : result ? (
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-slate-400">挖方量 (Cut)</span>
                <span className="text-lg font-bold text-blue-400">-{result.cutVolume.toLocaleString(undefined, {maximumFractionDigits: 2})} m³</span>
              </div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-slate-400">填方量 (Fill)</span>
                <span className="text-lg font-bold text-red-400">+{result.fillVolume.toLocaleString(undefined, {maximumFractionDigits: 2})} m³</span>
              </div>
              <div className="h-px bg-slate-700 my-3"></div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-200">净方量 (Net)</span>
                <span className={`text-xl font-black ${result.netVolume >= 0 ? 'text-green-400' : 'text-orange-400'}`}>
                  {result.netVolume.toLocaleString(undefined, {maximumFractionDigits: 2})} m³
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">有效计算面积</span>
                <span className="text-slate-200">{result.area.toLocaleString(undefined, {maximumFractionDigits: 2})} m²</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">网格规模</span>
                <span className="text-slate-200">{result.diffMap.cols} × {result.diffMap.rows}</span>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">可视化图例</h3>
              <div className="space-y-2 text-[12px]">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded bg-red-400"></div>
                  <span className="text-slate-300">填方 (对比期高于基础期)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded bg-blue-400"></div>
                  <span className="text-slate-300">挖方 (对比期低于基础期)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded bg-slate-600"></div>
                  <span className="text-slate-300">微小差异 / 无数据</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
            <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium leading-relaxed">
              请上传文件夹并执行<br/>网格化预处理
            </p>
          </div>
        )}
      </div>

      <div className="mt-auto pt-6 border-t border-slate-700">
        <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest leading-loose">
          Southern CASS Grid Algorithm Standard<br/>
          DTM-GRID Method v2.5
        </p>
      </div>
    </div>
  );
};
