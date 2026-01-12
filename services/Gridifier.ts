
import { MeshData, GridData, Point3D } from '../types';

export class Gridifier {
  /**
   * 采用真正的流式处理：通过 ReadableStream 分块读取文件
   * 避免了 file.text() 在处理大文件时的内存溢出和长度限制问题
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
      throw new Error("在所选 OBJ 文件中未发现有效顶点数据。请确保文件格式正确（文本格式 OBJ）。");
    }

    // 2. 初始化格网
    const cols = Math.ceil((maxX - minX) / gridSize) + 1;
    const rows = Math.ceil((maxY - minY) / gridSize) + 1;
    
    // 限制格网总数，防止浏览器显存溢出 (约 500万个点)
    if (cols * rows > 5000000) {
      throw new Error(`格网规模太大 (${cols}x${rows})，建议增大网格间距（当前 ${gridSize}m）。`);
    }

    onProgress?.(`初始化格网: ${cols} x ${rows}`);
    const heights = new Float32Array(rows * cols).fill(-1000000);

    // 3. 第二遍扫描：填充格网 (南方CASS DTM 采样逻辑：保留格网内最高点)
    let count = 0;
    for (const file of files) {
      count++;
      onProgress?.(`正在网格化: ${count} / ${files.length} (${file.name})`);
      await this.streamPopulateGrid(file, origin, heights, minX, minY, cols, rows, gridSize);
    }

    return {
      minX, minY, maxX, maxY,
      rows, cols,
      gridSize,
      heights
    };
  }

  /**
   * 使用流式读取扫描边界
   */
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

  /**
   * 使用流式读取填充格网
   */
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
            if (z > grid[idx]) {
              grid[idx] = z;
            }
          }
        }
      }
    });
  }

  /**
   * 核心辅助方法：流式按行读取文件
   * 这种方法内存占用极低
   */
  private static async readFileByLines(file: File, onLine: (line: string) => void) {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder();
    let partialLine = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = (partialLine + chunk).split(/\r?\n/);
      
      // 最后一部分可能是不完整的行，留到下个块处理
      partialLine = lines.pop() || '';

      for (const line of lines) {
        if (line.length > 0) {
          onLine(line);
        }
      }
    }

    if (partialLine.length > 0) {
      onLine(partialLine);
    }
  }
}
