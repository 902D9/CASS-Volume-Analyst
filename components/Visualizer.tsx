
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { VolumeResult, MeshData, GridData, BoundaryPoint, Point3D } from '../types';

interface Props {
  mesh1: MeshData | null;
  mesh2: MeshData | null;
  result: VolumeResult | null;
  boundary: BoundaryPoint[] | null;
}

export const Visualizer: React.FC<Props> = ({ mesh1, mesh2, result, boundary }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // 判定点是否在多边形内 (用于渲染过滤)
  const isInside = (x: number, y: number, poly: BoundaryPoint[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617); 
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000000);
    camera.position.set(400, 400, 400);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(500, 1000, 500);
    scene.add(mainLight);

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  const createClippedModel = (grid: GridData, origin: Point3D, poly: BoundaryPoint[] | null) => {
    const { heights, rows, cols, minX, minY, gridSize } = grid;
    const positions: number[] = [];
    const indices: number[] = [];
    const NO_DATA = -1000000;

    // 预计算顶点是否在界内
    const vertexInside = new Uint8Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const x = minX + c * gridSize;
        const y = minY + r * gridSize;
        vertexInside[idx] = (poly === null || isInside(x, y, poly)) ? 1 : 0;

        const h = heights[idx];
        positions.push(
          x - origin.x,
          (h <= NO_DATA ? -10 : h - origin.z), 
          -(y - origin.y)
        );
      }
    }

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i0 = r * cols + c;
        const i1 = r * cols + (c + 1);
        const i2 = (r + 1) * cols + c;
        const i3 = (r + 1) * cols + (c + 1);

        // 只有三角形的三个顶点都在界内且有数据时才生成面
        if (vertexInside[i0] && vertexInside[i1] && vertexInside[i2] &&
            heights[i0] > -900000 && heights[i1] > -900000 && heights[i2] > -900000) {
          indices.push(i0, i2, i1);
        }
        if (vertexInside[i1] && vertexInside[i2] && vertexInside[i3] &&
            heights[i1] > -900000 && heights[i2] > -900000 && heights[i3] > -900000) {
          indices.push(i1, i2, i3);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: 0x475569, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.1,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2
    }));
  };

  useEffect(() => {
    if (!sceneRef.current || !controlsRef.current || !cameraRef.current) return;

    ['grid1', 'grid2', 'result_viz', 'phase2_model', 'boundary_walls', 'boundary_top_line'].forEach(name => {
      const obj = sceneRef.current?.getObjectByName(name);
      if (obj) {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
        sceneRef.current?.remove(obj);
      }
    });

    let refOrigin: Point3D = { x: 0, y: 0, z: 0 };
    if (mesh1?.grid) {
      refOrigin = { x: mesh1.grid.minX, y: mesh1.grid.minY, z: mesh1.grid.heights.find(h => h > -900000) || 0 };
    } else if (mesh2?.grid) {
      refOrigin = { x: mesh2.grid.minX, y: mesh2.grid.minY, z: mesh2.grid.heights.find(h => h > -900000) || 0 };
    } else if (boundary && boundary.length > 0) {
      refOrigin = { x: boundary[0].x, y: boundary[0].y, z: 0 };
    }

    // 渲染围栏
    if (boundary && boundary.length > 0) {
      const wallHeight = 40;
      const positions: number[] = [];
      const indices: number[] = [];
      const linePoints: THREE.Vector3[] = [];
      const getZ = (x: number, y: number) => {
        if (!mesh2?.grid) return 0;
        const { minX, minY, gridSize, cols, rows, heights } = mesh2.grid;
        const c = Math.round((x - minX) / gridSize);
        const r = Math.round((y - minY) / gridSize);
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          const h = heights[r * cols + c];
          return h > -900000 ? h - refOrigin.z : 0;
        }
        return 0;
      };
      const fullBoundary = [...boundary, boundary[0]];
      for (let i = 0; i < fullBoundary.length; i++) {
        const p = fullBoundary[i];
        const lx = p.x - refOrigin.x;
        const lz = -(p.y - refOrigin.y);
        const gy = getZ(p.x, p.y);
        const ty = gy + wallHeight;
        positions.push(lx, gy, lz, lx, ty, lz);
        linePoints.push(new THREE.Vector3(lx, ty + 0.2, lz));
        if (i < fullBoundary.length - 1) {
          const c = i * 2, n = (i + 1) * 2;
          indices.push(c, n, c + 1, c + 1, n, n + 1);
        }
      }
      const wallGeo = new THREE.BufferGeometry();
      wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      wallGeo.setIndex(indices);
      wallGeo.computeVertexNormals();
      const wallMesh = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({
        color: 0xfacc15, transparent: true, opacity: 0.3, side: THREE.DoubleSide, emissive: 0xfacc15, emissiveIntensity: 0.2
      }));
      wallMesh.name = 'boundary_walls';
      sceneRef.current.add(wallMesh);
      const topLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints), new THREE.LineBasicMaterial({ color: 0xffffff }));
      topLine.name = 'boundary_top_line';
      sceneRef.current.add(topLine);
    }

    // 渲染分析结果 (仅在界内)
    if (result && mesh2?.grid) {
      const baseModel = createClippedModel(mesh2.grid, refOrigin, boundary);
      baseModel.name = 'phase2_model';
      sceneRef.current.add(baseModel);

      const { diffMap, gridSize } = result;
      const pos: number[] = [], col: number[] = [];
      for (let r = 0; r < diffMap.rows; r++) {
        for (let c = 0; c < diffMap.cols; c++) {
          const d = diffMap.data[r * diffMap.cols + c];
          if (Math.abs(d) < 0.01) continue;
          const x = diffMap.minX + c * gridSize;
          const y = diffMap.minY + r * gridSize;
          
          // result 本身已经过过滤，但为了视觉严谨再次校验
          if (boundary && !isInside(x, y, boundary)) continue;

          const h2 = mesh2.grid.heights[r * diffMap.cols + c];
          if (h2 < -900000) continue;
          pos.push(x - refOrigin.x, h2 - refOrigin.z + 0.1, -(y - refOrigin.y));
          if (d > 0.05) col.push(0.9, 0.2, 0.2);
          else if (d < -0.05) col.push(0.2, 0.4, 0.9);
          else col.push(0.4, 0.4, 0.4);
        }
      }
      if (pos.length > 0) {
        const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)).setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        const viz = new THREE.Points(geo, new THREE.PointsMaterial({ vertexColors: true, size: gridSize * 0.9, sizeAttenuation: true, depthWrite: false }));
        viz.name = 'result_viz';
        sceneRef.current.add(viz);
        const box = new THREE.Box3().setFromObject(viz);
        controlsRef.current.target.copy(box.getCenter(new THREE.Vector3()));
        controlsRef.current.update();
      }
    } 
    // 预览阶段
    else {
      const renderPreview = (grid: GridData, color: number, name: string) => {
        const pos: number[] = [];
        for(let i=0; i<grid.heights.length; i++) {
          if (grid.heights[i] < -900000) continue;
          const r = Math.floor(i / grid.cols), c = i % grid.cols;
          const x = grid.minX + c*grid.gridSize, y = grid.minY + r*grid.gridSize;
          if (boundary && !isInside(x, y, boundary)) continue;
          pos.push(x - refOrigin.x, grid.heights[i] - refOrigin.z, -(y - refOrigin.y));
        }
        if (pos.length === 0) return null;
        const p = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color, size: grid.gridSize * 0.5 }));
        p.name = name;
        sceneRef.current?.add(p);
        return p;
      };
      let focus = sceneRef.current.getObjectByName('boundary_walls') || null;
      if (mesh1?.grid) focus = renderPreview(mesh1.grid, 0x3b82f6, 'grid1') || focus;
      if (mesh2?.grid) focus = renderPreview(mesh2.grid, 0xef4444, 'grid2') || focus;
      if (focus) {
        const box = new THREE.Box3().setFromObject(focus);
        controlsRef.current.target.copy(box.getCenter(new THREE.Vector3()));
        controlsRef.current.update();
      }
    }
  }, [mesh1?.grid, mesh2?.grid, result, boundary]);

  return <div ref={mountRef} className="flex-1 w-full h-full" />;
};
