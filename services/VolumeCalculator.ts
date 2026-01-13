
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

  private static isPointInPoly(x: number, y: number, poly: BoundaryPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private static getCellWeight(x: number, y: number, gridSize: number, poly: BoundaryPoint[]): number {
    const subDiv = 10; 
    const subStep = gridSize / subDiv;
    const startX = x - gridSize / 2 + subStep / 2;
    const startY = y - gridSize / 2 + subStep / 2;
    let insideCount = 0;
    for (let r = 0; r < subDiv; r++) {
      for (let c = 0; c < subDiv; c++) {
        if (this.isPointInPoly(startX + c * subStep, startY + r * subStep, poly)) insideCount++;
      }
    }
    return insideCount / (subDiv * subDiv);
  }

  private static calculateFromGrids(grid1: GridData, grid2: GridData, boundary: BoundaryPoint[] | null): VolumeResult {
    const minX = Math.max(grid1.minX, grid2.minX);
    const minY = Math.max(grid1.minY, grid2.minY);
    const maxX = Math.min(grid1.maxX, grid2.maxX);
    const maxY = Math.min(grid1.maxY, grid2.maxY);

    if (maxX <= minX || maxY <= minY) throw new Error("两期数据的地理空间范围无交集。");

    const gridSize = grid1.gridSize; 
    const cols = Math.ceil((maxX - minX) / gridSize);
    const rows = Math.ceil((maxY - minY) / gridSize);
    let cutVolume = 0, fillVolume = 0, totalArea = 0;
    const diffData = new Float32Array(rows * cols).fill(0);
    const cellArea = gridSize * gridSize;
    const NO_DATA = -1000000;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = minX + c * gridSize;
        const y = minY + r * gridSize;
        let weight = 1.0;

        if (boundary) {
          if (!this.isPointInPoly(x, y, boundary)) {
            // 中心点不在界内，但方格可能跨界，执行精细采样
            weight = this.getCellWeight(x, y, gridSize, boundary);
          } else {
            // 中心点在界内，做全权重或快速采样
            weight = 1.0; // 简化处理，若追求极致可也用 getCellWeight
          }
        }
        if (weight <= 0) continue;

        const h1 = this.getHeightFromGrid(grid1, x, y);
        const h2 = this.getHeightFromGrid(grid2, x, y);
        if (h1 === NO_DATA || h2 === NO_DATA) continue;

        const diff = h2 - h1;
        diffData[r * cols + c] = diff;
        const effectiveArea = cellArea * weight;
        totalArea += effectiveArea;
        if (diff > 0) fillVolume += diff * effectiveArea;
        else cutVolume += Math.abs(diff) * effectiveArea;
      }
    }
    return { cutVolume, fillVolume, netVolume: fillVolume - cutVolume, area: totalArea, gridSize, diffMap: { minX, minY, maxX, maxY, rows, cols, data: diffData } };
  }

  private static getHeightFromGrid(grid: GridData, x: number, y: number): number {
    const c = Math.round((x - grid.minX) / grid.gridSize);
    const r = Math.round((y - grid.minY) / grid.gridSize);
    if (r >= 0 && r < grid.rows && c >= 0 && c < grid.cols) return grid.heights[r * grid.cols + c];
    return -1000000;
  }
}
