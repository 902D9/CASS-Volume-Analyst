
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
    scene.background = new THREE.Color(0x0f172a); 
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 10000000);
    camera.position.set(500, 500, 500);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      logarithmicDepthBuffer: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // 强光照，确保模型表面清晰
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
    mainLight.position.set(100, 1000, 100);
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

  /**
   * 生成第二期网格底座
   */
  const createBaseModel = (grid: GridData, origin: {x:number, y:number, z:number}) => {
    const { heights, rows, cols, minX, minY, gridSize } = grid;
    const positions: number[] = [];
    const indices: number[] = [];
    const NO_DATA = -1000000;

    // 1. 建立顶点缓冲区
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = heights[r * cols + c];
        positions.push(
          (minX + c * gridSize) - origin.x,
          (h === NO_DATA ? -50 : h - origin.z), 
          -(minY + r * gridSize) - origin.y
        );
      }
    }

    // 2. 三角化：每个 2x2 网格生成两个三角形
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i0 = r * cols + c;
        const i1 = r * cols + (c + 1);
        const i2 = (r + 1) * cols + c;
        const i3 = (r + 1) * cols + (c + 1);

        // 只有当格网的四个角都有数据时才绘制，保证模型完整且不出现异常拉伸
        if (heights[i0] > -900000 && heights[i1] > -900000 && 
            heights[i2] > -900000 && heights[i3] > -900000) {
          indices.push(i0, i2, i1);
          indices.push(i1, i2, i3);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x64748b, // 铝灰色底座
      side: THREE.DoubleSide,
      flatShading: true,
      roughness: 0.8,
      metalness: 0.2,
      polygonOffset: true, // 核心：开启深度偏移
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'phase2_model';
    return mesh;
  };

  useEffect(() => {
    if (!sceneRef.current || !controlsRef.current || !cameraRef.current) return;

    // 清理
    ['grid1', 'grid2', 'result_viz', 'phase2_model'].forEach(name => {
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

    // 结果渲染阶段
    if (result && mesh2?.grid) {
      // 1. 生成并添加二期模型底座
      const baseModel = createBaseModel(mesh2.grid, refOrigin);
      sceneRef.current.add(baseModel);

      // 2. 生成对比热力图点云
      const { diffMap, gridSize } = result;
      const { data, rows, cols, minX, minY } = diffMap;
      const positions: number[] = [];
      const colors: number[] = [];
      
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const diff = data[r * cols + c];
          if (Math.abs(diff) < 0.01) continue; 

          const px = (minX + c * gridSize) - refOrigin.x;
          const py = (minY + r * gridSize) - refOrigin.y;
          
          // 获取二期格网高度确保对齐
          const h2 = mesh2.grid.heights[r * cols + c];
          if (h2 < -900000) continue;
          
          // 垂直位置略高于底座模型 surface
          const pz = h2 - refOrigin.z + 0.1; 

          positions.push(px, pz, -py);

          if (diff > 0.05) {
            colors.push(0.95, 0.2, 0.2); // 填方：红
          } else if (diff < -0.05) {
            colors.push(0.2, 0.4, 0.95); // 挖方：蓝
          } else {
            colors.push(0.5, 0.5, 0.5);
          }
        }
      }

      if (positions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const material = new THREE.PointsMaterial({ 
          vertexColors: true, 
          size: gridSize * 0.95, 
          sizeAttenuation: true 
        });
        const viz = new THREE.Points(geometry, material);
        viz.name = 'result_viz';
        sceneRef.current.add(viz);

        const box = new THREE.Box3().setFromObject(viz);
        const center = box.getCenter(new THREE.Vector3());
        controlsRef.current.target.copy(center);
        cameraRef.current.position.set(center.x + 400, center.y + 400, center.z + 400);
        controlsRef.current.update();
      }
    } 
    // 预览阶段
    else {
      let focusObj: THREE.Object3D | null = null;
      const renderPoints = (grid: GridData, color: number, name: string) => {
        const { heights, rows, cols, minX, minY, gridSize } = grid;
        const pos: number[] = [];
        for(let i=0; i<heights.length; i++) {
          if (heights[i] < -900000) continue;
          const r = Math.floor(i / cols);
          const c = i % cols;
          pos.push((minX + c*gridSize) - refOrigin.x, heights[i] - refOrigin.z, -(minY + r*gridSize) - refOrigin.y);
        }
        if (pos.length === 0) return null;
        const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({ color, size: gridSize * 0.5 });
        const p = new THREE.Points(geo, mat);
        p.name = name;
        sceneRef.current?.add(p);
        return p;
      };

      if (mesh1?.grid) focusObj = renderPoints(mesh1.grid, 0x60a5fa, 'grid1') || focusObj;
      if (mesh2?.grid) {
        const p2 = renderPoints(mesh2.grid, 0xf87171, 'grid2');
        if (!focusObj) focusObj = p2;
      }
      if (focusObj) {
        const box = new THREE.Box3().setFromObject(focusObj);
        const center = box.getCenter(new THREE.Vector3());
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }
    }
  }, [mesh1?.grid, mesh2?.grid, result]);

  return <div ref={mountRef} className="flex-1 w-full h-full" />;
};
