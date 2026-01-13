
import { MeshData, GridData, Point3D, BoundaryPoint } from '../types';

export class Gridifier {
  static async processFoldersToGrid(
    files: File[], 
    origin: Point3D, 
    gridSize: number,
    boundary: BoundaryPoint[] | null,
    onProgress?: (msg: string) => void
  ): Promise<GridData> {
    
    // 1. 计算旋转参数 (CASS 风格：平行于第一条边)
    let rotationAngle = 0;
    let anchor: Point3D = { ...origin };
    if (boundary && boundary.length >= 2) {
      const dx = boundary[1].x - boundary[0].x;
      const dy = boundary[1].y - boundary[0].y;
      rotationAngle = Math.atan2(dy, dx);
      anchor = { x: boundary[0].x, y: boundary[0].y, z: origin.z };
    }

    const cos = Math.cos(-rotationAngle);
    const sin = Math.sin(-rotationAngle);

    // 2. 第一遍扫描：确定局部坐标系下的 Bounding Box
    onProgress?.("正在扫描地理范围 (对齐边界)...");
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const file of files) {
      await this.readFileByLines(file, (line) => {
        if (line.startsWith('v ')) {
          const parts = line.split(/\s+/);
          if (parts.length >= 4) {
            const gx = parseFloat(parts[1]) + origin.x;
            const gy = parseFloat(parts[2]) + origin.y;
            
            // 转换到局部坐标系
            const lx = (gx - anchor.x) * cos - (gy - anchor.y) * sin;
            const ly = (gx - anchor.x) * sin + (gy - anchor.y) * cos;

            if (lx < minX) minX = lx; if (lx > maxX) maxX = lx;
            if (ly < minY) minY = ly; if (ly > maxY) maxY = ly;
          }
        }
      });
    }

    if (minX === Infinity) throw new Error("未发现有效顶点数据。");

    // 增加冗余边距
    minX -= gridSize; minY -= gridSize;
    maxX += gridSize; maxY += gridSize;

    const cols = Math.ceil((maxX - minX) / gridSize);
    const rows = Math.ceil((maxY - minY) / gridSize);
    
    if (cols * rows > 10000000) throw new Error("格网规模过大，请增大网格间距。");

    onProgress?.(`格网对齐完成: ${cols} x ${rows}`);
    const heights = new Float32Array(rows * cols).fill(-1000000);

    // 3. 第二遍扫描：采样
    let count = 0;
    for (const file of files) {
      count++;
      onProgress?.(`点云网格化: ${count} / ${files.length}`);
      await this.readFileByLines(file, (line) => {
        if (line.startsWith('v ')) {
          const parts = line.split(/\s+/);
          if (parts.length >= 4) {
            const gx = parseFloat(parts[1]) + origin.x;
            const gy = parseFloat(parts[2]) + origin.y;
            const gz = parseFloat(parts[3]) + origin.z;

            const lx = (gx - anchor.x) * cos - (gy - anchor.y) * sin;
            const ly = (gx - anchor.x) * sin + (gy - anchor.y) * cos;

            const c = Math.floor((lx - minX) / gridSize);
            const r = Math.floor((ly - minY) / gridSize);

            if (r >= 0 && r < rows && c >= 0 && c < cols) {
              const idx = r * cols + c;
              if (gz > heights[idx]) heights[idx] = gz;
            }
          }
        }
      });
    }

    this.fillHoles(heights, rows, cols);
    return { minX, minY, maxX, maxY, rows, cols, gridSize, heights, rotationAngle, anchor };
  }

  private static fillHoles(grid: Float32Array, rows: number, cols: number) {
    const NO_DATA = -1000000;
    const copy = new Float32Array(grid);
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const idx = r * cols + c;
        if (grid[idx] !== NO_DATA) continue;
        let sum = 0, count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const val = grid[(r+dr)*cols + (c+dc)];
            if (val !== NO_DATA) { sum += val; count++; }
          }
        }
        if (count >= 3) copy[idx] = sum / count;
      }
    }
    grid.set(copy);
  }

  private static async readFileByLines(file: File, onLine: (line: string) => void) {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder();
    let partialLine = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = (partialLine + chunk).split(/\r?\n/);
      partialLine = lines.pop() || '';
      for (const line of lines) { if (line.length > 0) onLine(line); }
    }
    if (partialLine.length > 0) onLine(partialLine);
  }
}
