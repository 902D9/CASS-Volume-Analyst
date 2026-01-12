
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

    // 2. 初始化格网
    const cols = Math.ceil((maxX - minX) / gridSize) + 1;
    const rows = Math.ceil((maxY - minY) / gridSize) + 1;
    
    if (cols * rows > 5000000) {
      throw new Error(`格网规模太大 (${cols}x${rows})，建议增大网格间距。`);
    }

    onProgress?.(`初始化格网: ${cols} x ${rows}`);
    const heights = new Float32Array(rows * cols).fill(-1000000);

    // 3. 第二遍扫描：填充格网 (保留格网内最高点，符合倾斜摄影地表提取逻辑)
    let count = 0;
    for (const file of files) {
      count++;
      onProgress?.(`正在网格化: ${count} / ${files.length} (${file.name})`);
      await this.streamPopulateGrid(file, origin, heights, minX, minY, cols, rows, gridSize);
    }

    // 4. 关键：孔洞填充处理 (Hole Filling)
    // 解决采样点稀疏导致的格网空洞
    onProgress?.("正在内插修复格网孔洞...");
    this.fillHoles(heights, rows, cols);

    return {
      minX, minY, maxX, maxY,
      rows, cols,
      gridSize,
      heights
    };
  }

  /**
   * 简单的邻域内插填充算法
   * 对于没有值的点，查看周围 8 邻域，如果有超过 2 个邻居有值，则取均值
   */
  private static fillHoles(grid: Float32Array, rows: number, cols: number) {
    const NO_DATA = -1000000;
    // 使用副本防止扩散污染（单次迭代即可修复大部分小孔洞）
    const copy = new Float32Array(grid);
    
    // 执行两轮填充以应对较大孔洞
    for (let pass = 0; pass < 2; pass++) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          if (grid[idx] !== NO_DATA) continue;

          let sum = 0;
          let count = 0;

          // 检查 8 邻域
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = r + dr;
              const nc = c + dc;
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                const nVal = grid[nr * cols + nc];
                if (nVal !== NO_DATA) {
                  sum += nVal;
                  count++;
                }
              }
            }
          }

          // 如果周围有数据，则内插
          if (count >= 2) {
            copy[idx] = sum / count;
          }
        }
      }
      grid.set(copy);
    }
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

          const c = Math.round((x - minX) / gridSize);
          const r = Math.round((y - minY) / gridSize);

          if (r >= 0 && r < rows && c >= 0 && c < cols) {
            const idx = r * cols + c;
            // 倾斜摄影地表提取通常取格网内最大 Z 值以排除地面杂物干扰（CASS 常用逻辑）
            if (z > grid[idx]) {
              grid[idx] = z;
            }
          }
        }
      }
    });
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

      for (const line of lines) {
        if (line.length > 0) onLine(line);
      }
    }
    if (partialLine.length > 0) onLine(partialLine);
  }
}
