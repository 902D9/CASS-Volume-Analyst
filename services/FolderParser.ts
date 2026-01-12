
import { Point3D } from '../types';

export class FolderParser {
  /**
   * 仅解析 Metadata.xml 获取地理原点
   */
  static async parseMetadataOnly(files: File[]): Promise<Point3D> {
    const metadataFile = files.find(f => f.name.toLowerCase() === 'metadata.xml');
    if (!metadataFile) return { x: 0, y: 0, z: 0 };

    try {
      const text = await metadataFile.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      const originTag = xmlDoc.getElementsByTagName("SRSOrigin")[0] || 
                        xmlDoc.getElementsByTagName("Origin")[0];
      
      if (originTag) {
        const content = originTag.textContent || "";
        const coords = content.split(/[,\s]+/).map(s => s.trim()).filter(s => s !== "").map(Number);
        if (coords.length >= 3) return { x: coords[0], y: coords[1], z: coords[2] };
      }
    } catch (e) {
      console.warn("Metadata.xml 解析失败，使用默认原点。");
    }
    return { x: 0, y: 0, z: 0 };
  }
}
