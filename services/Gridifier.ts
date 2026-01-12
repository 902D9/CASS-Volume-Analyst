
import { MeshData, GridData, Point3D } from '../types';

export class Gridifier {
  /**
   * 采用流式处理并增加孔洞填充逻辑
   */
  static async processFoldersToGrid(
    files: File[], 
    origin: Point3D, 
    gridSize: number,
    onProgress?: (msg: string) => void
  ): Promise<GridData> {
    
    // 1. 第一遍扫描：确定全局 Bounding Box
    onProgress?.("正在扫描地理范围...");
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const file of files) {
      const bounds = await this.streamScanBounds(file, origin);
      if (bounds.minX < minX) minX = bounds.minX;
      if (bounds.minY < minY) minY = bounds.minY;
      if (bounds.maxX > maxX) maxX = bounds.maxX;
      if (bounds.maxY > maxY) maxY = bounds.maxY;
    }

    if (minX === Infinity) {
      throw new Error("在所选 OBJ 文件中未发现有效顶点数据。");
    }

    // 2. 初始化格网 (增加冗余边距确保边界稳定)
    const cols = Math.ceil((maxX - minX) / gridSize) + 2;
    const rows = Math.ceil((maxY - minY) / gridSize) + 2;
    
    if (cols * rows > 10000000) {
      throw new Error(`格网规模过大 (${cols}x${rows})，请增大网格间距。`);
    }

    onProgress?.(`格网初始化: ${cols} x ${rows}`);
    const heights = new Float32Array(rows * cols).fill(-1000000);

    // 3. 第二遍扫描：采样
    let count = 0;
    for (const file of files) {
      count++;
      onProgress?.(`点云网格化: ${count} / ${files.length}`);
      await this.streamPopulateGrid(file, origin, heights, minX, minY, cols, rows, gridSize);
    }

    // 4. 填充
    onProgress?.("优化格网完整度...");
    this.fillHoles(heights, rows, cols);

    return { minX, minY, maxX, maxY, rows, cols, gridSize, heights };
  }

  private static async streamScanBounds(file: File, origin: Point3D) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    await this.readFileByLines(file, (line) => {
      if (line.startsWith('v ')) {
        const parts = line.split(/\s+/);
        if (parts.length >= 4) {
          const x = parseFloat(parts[1]) + origin.x;
          const y = parseFloat(parts[2]) + origin.y;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    });
    return { minX, minY, maxX, maxY };
  }

  private static async streamPopulateGrid(
    file: File, 
    origin: Point3D, 
    grid: Float32Array, 
    minX: number, 
    minY: number, 
    cols: number, 
    rows: number, 
    gridSize: number
  ) {
    await this.readFileByLines(file, (line) => {
      if (line.startsWith('v ')) {
        const parts = line.split(/\s+/);
        if (parts.length >= 4) {
          const x = parseFloat(parts[1]) + origin.x;
          const y = parseFloat(parts[2]) + origin.y;
          const z = parseFloat(parts[3]) + origin.z;

          // 使用 floor 保证格网位置的绝对稳定性
          const c = Math.floor((x - minX) / gridSize);
          const r = Math.floor((y - minY) / gridSize);

          if (r >= 0 && r < rows && c >= 0 && c < cols) {
            const idx = r * cols + c;
            // 倾斜摄影地表提取通常取格网内最高 Z 值
            if (z > grid[idx]) {
              grid[idx] = z;
            }
          }
        }
      }
    });
  }

  private static fillHoles(grid: Float32Array, rows: number, cols: number) {
    const NO_DATA = -1000000;
    const copy = new Float32Array(grid);
    for (let pass = 0; pass < 1; pass++) {
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
