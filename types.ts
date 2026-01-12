
import * as THREE from 'three';

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface BoundaryPoint {
  id: string;
  x: number; // Easting (东坐标)
  y: number; // Northing (北坐标)
}

export interface GridData {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  rows: number;
  cols: number;
  gridSize: number;
  heights: Float32Array; // Z values for each grid intersection
}

export interface VolumeResult {
  cutVolume: number;
  fillVolume: number;
  netVolume: number;
  area: number;
  gridSize: number;
  diffMap: HeightDiffGrid;
}

export interface HeightDiffGrid {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  rows: number;
  cols: number;
  data: Float32Array;
}

export interface MeshData {
  vertexGroups: Float32Array[]; 
  name: string;
  origin: Point3D;
  grid?: GridData; // Sampled grid for preview
}
