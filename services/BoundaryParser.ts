
import { BoundaryPoint } from '../types';

export class BoundaryParser {
  /**
   * 解析 CSV 格式: 编号,北坐标(X),东坐标(Y)
   * 注意：测绘中的 X 通常对应数学坐标系的 Y (Northing)，Y 对应 X (Easting)
   */
  static async parseCSV(file: File): Promise<BoundaryPoint[]> {
    const text = await file.text();
    const lines = text.split(/\r?\n/);
    const points: BoundaryPoint[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      
      // 处理逗号或空格分隔
      const parts = line.split(/[,\t]+/).map(p => p.trim());
      if (parts.length >= 3) {
        const id = parts[0];
        // 测绘坐标习惯：第一列通常是北坐标(N)，第二列是东坐标(E)
        // 对应到程序坐标：X = Easting, Y = Northing
        const northing = parseFloat(parts[1]);
        const easting = parseFloat(parts[2]);

        if (!isNaN(northing) && !isNaN(easting)) {
          points.push({
            id,
            x: easting,
            y: northing
          });
        }
      }
    }
    return points;
  }
}
