
import { MeshData, VolumeResult, HeightDiffGrid, GridData, BoundaryPoint } from '../types';

interface Vec2 { x: number; y: number; }

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

  private static calculateFromGrids(grid1: GridData, grid2: GridData, boundary: BoundaryPoint[] | null): VolumeResult {
    // CASS 逻辑：计算在局部旋转坐标系下的交集
    const minX = Math.max(grid1.minX, grid2.minX);
    const minY = Math.max(grid1.minY, grid2.minY);
    const maxX = Math.min(grid1.maxX, grid2.maxX);
    const maxY = Math.min(grid1.maxY, grid2.maxY);

    const gridSize = grid1.gridSize; 
    const cols = Math.ceil((maxX - minX) / gridSize);
    const rows = Math.ceil((maxY - minY) / gridSize);
    
    let cutVolume = 0, fillVolume = 0, totalArea = 0;
    const diffData = new Float32Array(rows * cols).fill(0);
    const NO_DATA = -1000000;

    // 转换边界到局部坐标系以便裁剪
    const localBoundary: Vec2[] = [];
    if (boundary) {
      const cos = Math.cos(-grid1.rotationAngle);
      const sin = Math.sin(-grid1.rotationAngle);
      boundary.forEach(p => {
        localBoundary.push({
          x: (p.x - grid1.anchor.x) * cos - (p.y - grid1.anchor.y) * sin,
          y: (p.x - grid1.anchor.x) * sin + (p.y - grid1.anchor.y) * cos
        });
      });
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lx = minX + c * gridSize;
        const ly = minY + r * gridSize;
        
        // CASS 算法：计算格网单元 (Square) 与矿界的几何交集面积
        const cellRect: Vec2[] = [
          { x: lx, y: ly },
          { x: lx + gridSize, y: ly },
          { x: lx + gridSize, y: ly + gridSize },
          { x: lx, y: ly + gridSize }
        ];

        let effectiveArea = gridSize * gridSize;
        if (localBoundary.length > 0) {
          const intersection = this.clipPolygon(cellRect, localBoundary);
          effectiveArea = this.getPolygonArea(intersection);
        }

        if (effectiveArea <= 0.0001) continue;

        // 获取该格网中心的高程（在局部坐标系中直接查找）
        const h1 = this.getHeightFromLocalGrid(grid1, lx + gridSize/2, ly + gridSize/2);
        const h2 = this.getHeightFromLocalGrid(grid2, lx + gridSize/2, ly + gridSize/2);
        
        if (h1 <= NO_DATA || h2 <= NO_DATA) continue;

        const diff = h2 - h1;
        diffData[r * cols + c] = diff;
        totalArea += effectiveArea;
        
        if (diff > 0) fillVolume += diff * effectiveArea;
        else cutVolume += Math.abs(diff) * effectiveArea;
      }
    }

    return { 
      cutVolume, 
      fillVolume, 
      netVolume: fillVolume - cutVolume, 
      area: totalArea, 
      gridSize, 
      diffMap: { minX, minY, maxX, maxY, rows, cols, data: diffData } 
    };
  }

  private static getHeightFromLocalGrid(grid: GridData, lx: number, ly: number): number {
    const c = Math.floor((lx - grid.minX) / grid.gridSize);
    const r = Math.floor((ly - grid.minY) / grid.gridSize);
    if (r >= 0 && r < grid.rows && c >= 0 && c < grid.cols) return grid.heights[r * grid.cols + c];
    return -1000000;
  }

  // Sutherland-Hodgman 多边形裁剪
  private static clipPolygon(subject: Vec2[], clip: Vec2[]): Vec2[] {
    let output = subject;
    for (let j = 0; j < clip.length; j++) {
      const clipEdgeStart = clip[j];
      const clipEdgeEnd = clip[(j + 1) % clip.length];
      const input = output;
      output = [];
      if (input.length === 0) break;

      let s = input[input.length - 1];
      for (const e of input) {
        if (this.isInsideEdge(e, clipEdgeStart, clipEdgeEnd)) {
          if (!this.isInsideEdge(s, clipEdgeStart, clipEdgeEnd)) {
            output.push(this.getIntersection(s, e, clipEdgeStart, clipEdgeEnd));
          }
          output.push(e);
        } else if (this.isInsideEdge(s, clipEdgeStart, clipEdgeEnd)) {
          output.push(this.getIntersection(s, e, clipEdgeStart, clipEdgeEnd));
        }
        s = e;
      }
    }
    return output;
  }

  private static isInsideEdge(p: Vec2, start: Vec2, end: Vec2): boolean {
    return (end.x - start.x) * (p.y - start.y) - (end.y - start.y) * (p.x - start.x) >= 0;
  }

  private static getIntersection(s: Vec2, e: Vec2, start: Vec2, end: Vec2): Vec2 {
    const dc = { x: start.x - end.x, y: start.y - end.y };
    const dp = { x: s.x - e.x, y: s.y - e.y };
    const n1 = start.x * end.y - start.y * end.x;
    const n2 = s.x * e.y - s.y * e.x;
    const n3 = 1.0 / (dc.x * dp.y - dc.y * dp.x);
    return { x: (n1 * dp.x - n2 * dc.x) * n3, y: (n1 * dp.y - n2 * dc.y) * n3 };
  }

  private static getPolygonArea(poly: Vec2[]): number {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      area += poly[i].x * poly[j].y;
      area -= poly[j].x * poly[i].y;
    }
    return Math.abs(area) / 2;
  }
}
