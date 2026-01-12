
import { MeshData, VolumeResult, HeightDiffGrid, GridData, BoundaryPoint } from '../types';

export class VolumeCalculator {
  static calculate(
    mesh1: MeshData, 
    mesh2: MeshData, 
    boundary: BoundaryPoint[] | null,
    gridSize: number = 1.0
  ): VolumeResult {
    if (mesh1.grid && mesh2.grid) {
      return this.calculateFromGrids(mesh1.grid, mesh2.grid, boundary);
    }
    throw new Error("请先完成两期数据的网格化预处理。");
  }

  /**
   * 判定点是否在多边形内 (射线法)
   */
  private static isPointInPoly(x: number, y: number, poly: BoundaryPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private static calculateFromGrids(
    grid1: GridData, 
    grid2: GridData, 
    boundary: BoundaryPoint[] | null
  ): VolumeResult {
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
    let totalArea = 0;
    const diffData = new Float32Array(rows * cols).fill(0);
    const cellArea = gridSize * gridSize;
    const NO_DATA = -1000000;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = minX + c * gridSize;
        const y = minY + r * gridSize;

        // 如果定义了矿界，则进行边界检查
        if (boundary && !this.isPointInPoly(x, y, boundary)) {
          continue; 
        }

        const h1 = this.getHeightWithFallback(grid1, x, y);
        const h2 = this.getHeightWithFallback(grid2, x, y);

        const idx = r * cols + c;
        if (h1 === NO_DATA || h2 === NO_DATA) {
          continue;
        }

        const diff = h2 - h1;
        diffData[idx] = diff;
        totalArea += cellArea;

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
      area: totalArea,
      gridSize,
      diffMap: {
        minX, minY, maxX, maxY, rows, cols,
        data: diffData
      }
    };
  }

  private static getHeightWithFallback(grid: GridData, x: number, y: number): number {
    const c = Math.round((x - grid.minX) / grid.gridSize);
    const r = Math.round((y - grid.minY) / grid.gridSize);
    const NO_DATA = -1000000;

    if (r >= 0 && r < grid.rows && c >= 0 && c < grid.cols) {
      const val = grid.heights[r * grid.cols + c];
      if (val !== NO_DATA) return val;
      
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
