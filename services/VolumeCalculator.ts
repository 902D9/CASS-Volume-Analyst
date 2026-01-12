
import { MeshData, VolumeResult, HeightDiffGrid, GridData } from '../types';

export class VolumeCalculator {
  static calculate(mesh1: MeshData, mesh2: MeshData, gridSize: number = 1.0): VolumeResult {
    if (mesh1.grid && mesh2.grid) {
      return this.calculateFromGrids(mesh1.grid, mesh2.grid);
    }
    throw new Error("请先完成两期数据的网格化预处理。");
  }

  private static calculateFromGrids(grid1: GridData, grid2: GridData): VolumeResult {
    const minX = Math.max(grid1.minX, grid2.minX);
    const minY = Math.max(grid1.minY, grid2.minY);
    const maxX = Math.min(grid1.maxX, grid2.maxX);
    const maxY = Math.min(grid1.maxY, grid2.maxY);

    if (maxX <= minX || maxY <= minY) {
      throw new Error("两期数据的地理空间范围无交集，无法对比。");
    }

    const gridSize = grid1.gridSize; 
    const cols = Math.ceil((maxX - minX) / gridSize);
    const rows = Math.ceil((maxY - minY) / gridSize);

    let cutVolume = 0;
    let fillVolume = 0;
    const diffData = new Float32Array(rows * cols);
    const cellArea = gridSize * gridSize;
    const NO_DATA = -1000000;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = minX + c * gridSize;
        const y = minY + r * gridSize;

        const h1 = this.getHeightWithFallback(grid1, x, y);
        const h2 = this.getHeightWithFallback(grid2, x, y);

        const idx = r * cols + c;
        if (h1 === NO_DATA || h2 === NO_DATA) {
          diffData[idx] = 0;
          continue;
        }

        const diff = h2 - h1;
        diffData[idx] = diff;

        if (diff > 0) {
          fillVolume += diff * cellArea;
        } else {
          cutVolume += Math.abs(diff) * cellArea;
        }
      }
    }

    return {
      cutVolume,
      fillVolume,
      netVolume: fillVolume - cutVolume,
      area: rows * cols * cellArea,
      gridSize,
      diffMap: {
        minX, minY, maxX, maxY, rows, cols,
        data: diffData
      }
    };
  }

  /**
   * 带有容错的高度查询
   */
  private static getHeightWithFallback(grid: GridData, x: number, y: number): number {
    const c = Math.round((x - grid.minX) / grid.gridSize);
    const r = Math.round((y - grid.minY) / grid.gridSize);
    const NO_DATA = -1000000;

    if (r >= 0 && r < grid.rows && c >= 0 && c < grid.cols) {
      const val = grid.heights[r * grid.cols + c];
      if (val !== NO_DATA) return val;
      
      // 如果当前格网点无数据，尝试搜索极近距离（1格以内）的有效点
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < grid.rows && nc >= 0 && nc < grid.cols) {
            const nVal = grid.heights[nr * grid.cols + nc];
            if (nVal !== NO_DATA) return nVal;
          }
        }
      }
    }
    return NO_DATA;
  }
}
