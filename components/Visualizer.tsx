
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { VolumeResult, MeshData, GridData } from '../types';

interface Props {
  mesh1: MeshData | null;
  mesh2: MeshData | null;
  result: VolumeResult | null;
}

export const Visualizer: React.FC<Props> = ({ mesh1, mesh2, result }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 2000000);
    camera.position.set(500, 500, 500);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      logarithmicDepthBuffer: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 1000, 100);
    scene.add(dirLight);

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

  // 辅助函数：生成三角剖分地形网格
  const createTerrainMesh = (grid: GridData, refOrigin: {x:number, y:number, z:number}, name: string, color: number) => {
    const { heights, rows, cols, minX, minY, gridSize } = grid;
    const positions: number[] = [];
    const indices: number[] = [];
    const NO_DATA = -1000000;

    // 1. 生成顶点
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = heights[r * cols + c];
        // 即使是无数据点也占用位置，但在索引中跳过
        positions.push(
          (minX + c * gridSize) - refOrigin.x,
          (h === NO_DATA ? -50 : h - refOrigin.z), 
          -(minY + r * gridSize) - refOrigin.y
        );
      }
    }

    // 2. 生成索引（三角剖分）
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i0 = r * cols + c;
        const i1 = r * cols + (c + 1);
        const i2 = (r + 1) * cols + c;
        const i3 = (r + 1) * cols + (c + 1);

        // 只有四个顶点都有数据时才绘制该网格面
        if (heights[i0] !== NO_DATA && heights[i1] !== NO_DATA && 
            heights[i2] !== NO_DATA && heights[i3] !== NO_DATA) {
          indices.push(i0, i2, i1);
          indices.push(i1, i2, i3);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
      color: color,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      flatShading: false,
      wireframe: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    return mesh;
  };

  useEffect(() => {
    if (!sceneRef.current || !controlsRef.current || !cameraRef.current) return;

    // 清理旧对象
    ['grid1', 'grid2', 'result_viz', 'base_mesh'].forEach(name => {
      const obj = sceneRef.current?.getObjectByName(name);
      if (obj) {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
        sceneRef.current?.remove(obj);
      }
    });

    const refOrigin = mesh1?.origin || mesh2?.origin || { x: 0, y: 0, z: 0 };

    // 状态 A: 如果有对比结果，显示对比点云 + 第二期地形底座
    if (result && mesh2?.grid) {
      // 1. 添加第二期地形底座 (静态网格)
      const baseMesh = createTerrainMesh(mesh2.grid, refOrigin, 'base_mesh', 0x334155);
      sceneRef.current.add(baseMesh);

      // 2. 添加对比差异热力图
      const { diffMap, gridSize } = result;
      const positions: number[] = [];
      const colors: number[] = [];
      const { data, rows, cols, minX, minY } = diffMap;
      
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const diff = data[r * cols + c];
          if (Math.abs(diff) < 0.01) continue; 

          const sx = (minX + c * gridSize) - refOrigin.x;
          const sy = (minY + r * gridSize) - refOrigin.y;
          
          // 获取当前点在第二期格网中的实际高度作为垂直显示位置
          const h2 = mesh2.grid.heights[r * cols + c];
          if (h2 < -900000) continue;
          const sz = h2 - refOrigin.z + 0.2; // 略微抬高避免深度冲突

          positions.push(sx, sz, -sy);

          if (diff > 0.05) {
            colors.push(0.95, 0.2, 0.2); // 填方：红
          } else if (diff < -0.05) {
            colors.push(0.2, 0.4, 0.95); // 挖方：蓝
          } else {
            colors.push(0.5, 0.5, 0.5); // 灰
          }
        }
      }

      if (positions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const material = new THREE.PointsMaterial({ vertexColors: true, size: gridSize * 0.8 });
        const viz = new THREE.Points(geometry, material);
        viz.name = 'result_viz';
        sceneRef.current.add(viz);

        // 聚焦结果
        const box = new THREE.Box3().setFromObject(viz);
        const center = box.getCenter(new THREE.Vector3());
        controlsRef.current.target.copy(center);
        cameraRef.current.position.set(center.x + 500, center.y + 500, center.z + 500);
        controlsRef.current.update();
      }
      return; 
    }

    // 状态 B: 仅导入阶段，显示点云预览
    let focusObj: THREE.Object3D | null = null;
    const renderPreviewPoints = (grid: GridData, color: number, name: string) => {
      const { heights, rows, cols, minX, minY, gridSize } = grid;
      const pos: number[] = [];
      for(let i=0; i<heights.length; i++) {
        if (heights[i] < -900000) continue;
        const r = Math.floor(i / cols);
        const c = i % cols;
        pos.push(
          (minX + c*gridSize) - refOrigin.x, 
          heights[i] - refOrigin.z, 
          -(minY + r*gridSize) - refOrigin.y
        );
      }
      if (pos.length === 0) return null;
      const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ color, size: gridSize * 0.4, opacity: 0.6, transparent: true });
      const p = new THREE.Points(geo, mat);
      p.name = name;
      sceneRef.current?.add(p);
      return p;
    };

    if (mesh1?.grid) focusObj = renderPreviewPoints(mesh1.grid, 0x60a5fa, 'grid1') || focusObj;
    if (mesh2?.grid) {
      const p2 = renderPreviewPoints(mesh2.grid, 0xf87171, 'grid2');
      if (!focusObj) focusObj = p2;
    }

    if (focusObj) {
      const box = new THREE.Box3().setFromObject(focusObj);
      const center = box.getCenter(new THREE.Vector3());
      controlsRef.current.target.copy(center);
      cameraRef.current.position.set(center.x + 400, center.y + 400, center.z + 400);
      controlsRef.current.update();
    }

  }, [mesh1?.grid, mesh2?.grid, result]);

  return <div ref={mountRef} className="flex-1 w-full h-full" />;
};
