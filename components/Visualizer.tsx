
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

  useEffect(() => {
    if (!mountRef.current) return;
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617); 
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 10000000);
    camera.position.set(1000, 1000, 1000);
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(2000, 5000, 2000);
    scene.add(sun);

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

  const createFullGridGroup = (grid: GridData, origin: Point3D, color: number, diffData?: Float32Array) => {
    const { heights, rows, cols, minX, minY, gridSize } = grid;
    const positions: number[] = [];
    const nodeColors: number[] = [];
    const NO_DATA = -1000000;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const h = heights[idx];
        const gx = minX + c * gridSize;
        const gy = minY + r * gridSize;

        const lx = gx - origin.x;
        const lz = -(gy - origin.y); // 地理北向映射到 -Z
        const ly = h - origin.z;
        
        // 即使是无效数据也占位，但在索引阶段剔除
        positions.push(lx, h <= NO_DATA ? -100 : ly, lz);

        if (diffData) {
          const d = diffData[idx];
          if (d > 0.05) nodeColors.push(0.9, 0.2, 0.2); // 填方红
          else if (d < -0.05) nodeColors.push(0.2, 0.4, 0.9); // 挖方蓝
          else nodeColors.push(0.5, 0.5, 0.5);
        } else {
          // 默认颜色：第一期蓝色系，第二期红色系
          if (color === 0x3b82f6) nodeColors.push(0.2, 0.4, 0.8);
          else nodeColors.push(0.8, 0.2, 0.2);
        }
      }
    }

    const indices: number[] = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i0 = r * cols + c, i1 = r * cols + (c + 1), i2 = (r + 1) * cols + c, i3 = (r + 1) * cols + (c + 1);
        if (heights[i0] > NO_DATA && heights[i1] > NO_DATA && heights[i2] > NO_DATA) indices.push(i0, i2, i1);
        if (heights[i1] > NO_DATA && heights[i2] > NO_DATA && heights[i3] > NO_DATA) indices.push(i1, i2, i3);
      }
    }

    const group = new THREE.Group();
    if (indices.length === 0) return group;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    // 1. 半透明实体
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ 
      color: color, 
      side: THREE.DoubleSide, 
      transparent: true, 
      opacity: 0.3 
    }));
    group.add(mesh);

    // 2. DTM 线框
    const wireframe = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ 
      color: color, 
      wireframe: true, 
      transparent: true, 
      opacity: 0.4 
    }));
    wireframe.position.y += 0.02;
    group.add(wireframe);

    // 3. 采样点云
    const ptGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)).setAttribute('color', new THREE.Float32BufferAttribute(nodeColors, 3));
    const points = new THREE.Points(ptGeo, new THREE.PointsMaterial({ 
      vertexColors: true, 
      size: 2, 
      sizeAttenuation: true 
    }));
    points.position.y += 0.05;
    group.add(points);

    return group;
  };

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !controlsRef.current) return;

    // 清理场景
    ['model_1', 'model_2', 'boundary_line'].forEach(n => {
      const obj = scene.getObjectByName(n);
      if (obj) {
        obj.traverse((c: any) => { 
          if(c.geometry) c.geometry.dispose(); 
          if(c.material) Array.isArray(c.material) ? c.material.forEach((m:any)=>m.dispose()) : c.material.dispose(); 
        });
        scene.remove(obj);
      }
    });

    // 计算全局参考原点：取第一期的范围起点
    let refOrigin: Point3D = { x: 0, y: 0, z: 0 };
    if (mesh1?.grid) {
      refOrigin = { x: mesh1.grid.minX, y: mesh1.grid.minY, z: mesh1.grid.heights.find(h => h > -900000) || 0 };
    } else if (mesh2?.grid) {
      refOrigin = { x: mesh2.grid.minX, y: mesh2.grid.minY, z: mesh2.grid.heights.find(h => h > -900000) || 0 };
    } else if (boundary && boundary.length > 0) {
      refOrigin = { x: boundary[0].x, y: boundary[0].y, z: 0 };
    }

    // 1. 绘制第一期 (蓝色系)
    if (mesh1?.grid) {
      const g1 = createFullGridGroup(mesh1.grid, refOrigin, 0x3b82f6);
      g1.name = 'model_1';
      scene.add(g1);
    }

    // 2. 绘制第二期 (红色系)
    if (mesh2?.grid) {
      // 如果有计算结果，传入差异数据进行着色
      const g2 = createFullGridGroup(mesh2.grid, refOrigin, 0xef4444, result?.diffMap.data);
      g2.name = 'model_2';
      scene.add(g2);
    }

    // 3. 绘制矿界线 (黄色)
    if (boundary && boundary.length >= 2) {
      const bPts: THREE.Vector3[] = [];
      boundary.forEach(p => bPts.push(new THREE.Vector3(p.x - refOrigin.x, 1, -(p.y - refOrigin.y))));
      if (boundary.length > 2) bPts.push(bPts[0]); // 闭合
      const bLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(bPts), new THREE.LineBasicMaterial({ color: 0xfacc15, linewidth: 3 }));
      bLine.name = 'boundary_line';
      scene.add(bLine);
    }

    // 自动聚焦
    const allModels = scene.children.filter(c => c.name.startsWith('model_') || c.name === 'boundary_line');
    if (allModels.length > 0) {
      const group = new THREE.Group();
      allModels.forEach(m => group.add(m.clone())); // 临时组合计算包围盒
      const box = new THREE.Box3().setFromObject(group);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        controlsRef.current.target.copy(center);
        // 如果是首次加载，调整相机位置
        if (cameraRef.current && cameraRef.current.position.length() < 2000) {
          cameraRef.current.position.set(center.x + 500, center.y + 500, center.z + 500);
        }
        controlsRef.current.update();
      }
    }
  }, [mesh1?.grid, mesh2?.grid, result, boundary]);

  return <div ref={mountRef} className="flex-1 w-full h-full relative" />;
};
