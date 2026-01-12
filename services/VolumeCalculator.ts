
import { MeshData, VolumeResult, HeightDiffGrid } from '../types';

export class VolumeCalculator {
  static calculate(mesh1: MeshData, mesh2: MeshData, gridSize: number = 1.0): VolumeResult {
    // 1. Get Global Bounding Boxes
    const box1 = this.getGlobalBoundingBox(mesh1);
    const box2 = this.getGlobalBoundingBox(mesh2);

    // 2. Find intersection
    const minX = Math.max(box1.minX, box2.minX);
    const minY = Math.max(box1.minY, box2.minY);
    const maxX = Math.min(box1.maxX, box2.maxX);
    const maxY = Math.min(box1.maxY, box2.maxY);

    if (maxX <= minX || maxY <= minY) {
      throw new Error("模型在地理空间上没有交集，请检查 metadata.xml 的坐标原点。");
    }

    const cols = Math.ceil((maxX - minX) / gridSize);
    const rows = Math.ceil((maxY - minY) / gridSize);

    // Limit grid size to prevent OOM
    if (cols * rows > 4000000) {
      throw new Error(`格网数量过大 (${cols}x${rows})，请增大方格网间距。`);
    }

    // 3. Generate Height Maps (Using geographic coordinates)
    const heightMap1 = this.generateHeightMap(mesh1, minX, minY, maxX, maxY, gridSize);
    const heightMap2 = this.generateHeightMap(mesh2, minX, minY, maxX, maxY, gridSize);

    let cutVolume = 0;
    let fillVolume = 0;
    const diffData = new Float32Array(rows * cols);
    const cellArea = gridSize * gridSize;

    for (let i = 0; i < rows * cols; i++) {
      const h1 = heightMap1[i];
      const h2 = heightMap2[i];

      // -1e9 is our "NO DATA" flag
      if (h1 < -999999 || h2 < -999999) {
        diffData[i] = 0;
        continue;
      }

      const diff = h2 - h1;
      diffData[i] = diff;

      if (diff > 0) {
        fillVolume += diff * cellArea;
      } else {
        cutVolume += Math.abs(diff) * cellArea;
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

  private static getGlobalBoundingBox(mesh: MeshData) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const { origin, vertexGroups } = mesh;

    for (const vertices of vertexGroups) {
      for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i] + origin.x;
        const y = vertices[i + 1] + origin.y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return { minX, minY, maxX, maxY };
  }

  private static generateHeightMap(
    mesh: MeshData, 
    minX: number, 
    minY: number, 
    maxX: number, 
    maxY: number, 
    gridSize: number
  ): Float32Array {
    const cols = Math.ceil((maxX - minX) / gridSize);
    const rows = Math.ceil((maxY - minY) / gridSize);
    const grid = new Float32Array(rows * cols).fill(-1000000); // Using large negative as flag
    
    const { origin, vertexGroups } = mesh;

    for (const vertices of vertexGroups) {
      for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i] + origin.x;
        const y = vertices[i + 1] + origin.y;
        const z = vertices[i + 2] + origin.z;

        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          const c = Math.floor((x - minX) / gridSize);
          const r = Math.floor((y - minY) / gridSize);

          if (r >= 0 && r < rows && c >= 0 && c < cols) {
            const idx = r * cols + c;
            // DTM logic: usually take the highest point in the cell for grid method
            if (z > grid[idx]) {
              grid[idx] = z;
            }
          }
        }
      }
    }

    // Basic interpolation for small holes
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const idx = r * cols + c;
        if (grid[idx] < -999999) {
          let sum = 0, count = 0;
          const neighbors = [
            grid[(r-1)*cols + c], grid[(r+1)*cols + c], 
            grid[r*cols + (c-1)], grid[r*cols + (c+1)]
          ];
          for (const h of neighbors) {
            if (h > -999999) {
              sum += h;
              count++;
            }
          }
          if (count > 0) grid[idx] = sum / count;
        }
      }
    }

    return grid;
  }
}
