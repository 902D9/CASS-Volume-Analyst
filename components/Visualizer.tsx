
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

    const camera = new THREE.PerspectiveCamera(50, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000000);
    camera.position.set(400, 400, 400);
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

  const createBaseModel = (grid: GridData, origin: Point3D) => {
    const { heights, rows, cols, minX, minY, gridSize } = grid;
    const positions: number[] = [];
    const indices: number[] = [];
    const NO_DATA = -1000000;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = heights[r * cols + c];
        positions.push(
          (minX + c * gridSize) - origin.x,
          (h <= NO_DATA ? -10 : h - origin.z), 
          -((minY + r * gridSize) - origin.y)
        );
      }
    }

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i0 = r * cols + c;
        const i1 = r * cols + (c + 1);
        const i2 = (r + 1) * cols + c;
        const i3 = (r + 1) * cols + (c + 1);

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
      color: 0x475569,
      side: THREE.DoubleSide,
      flatShading: false,
      roughness: 0.7,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'phase2_model';
    return mesh;
  };

  useEffect(() => {
    if (!sceneRef.current || !controlsRef.current || !cameraRef.current) return;

    // 清理旧物体
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

    // 寻找参考原点
    let refOrigin: Point3D = { x: 0, y: 0, z: 0 };
    if (mesh1?.grid) {
      refOrigin = { x: mesh1.grid.minX, y: mesh1.grid.minY, z: mesh1.grid.heights.find(h => h > -900000) || 0 };
    } else if (mesh2?.grid) {
      refOrigin = { x: mesh2.grid.minX, y: mesh2.grid.minY, z: mesh2.grid.heights.find(h => h > -900000) || 0 };
    } else if (boundary && boundary.length > 0) {
      refOrigin = { x: boundary[0].x, y: boundary[0].y, z: 0 };
    }

    // 2. 渲染矿界“围栏墙”
    if (boundary && boundary.length > 0) {
      const wallHeight = 40; // 围栏高度(米)
      const positions: number[] = [];
      const indices: number[] = [];
      const linePoints: THREE.Vector3[] = [];

      // 获取特定坐标的高程
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

      // 闭合点处理
      const fullBoundary = [...boundary, boundary[0]];

      for (let i = 0; i < fullBoundary.length; i++) {
        const p = fullBoundary[i];
        const localX = p.x - refOrigin.x;
        const localZ = -(p.y - refOrigin.y);
        const groundY = getZ(p.x, p.y);
        const topY = groundY + wallHeight;

        // 墙壁顶点
        positions.push(localX, groundY, localZ); // 底部顶点
        positions.push(localX, topY, localZ);    // 顶部顶点
        
        linePoints.push(new THREE.Vector3(localX, topY + 0.2, localZ));

        if (i < fullBoundary.length - 1) {
          const curr = i * 2;
          const next = (i + 1) * 2;
          // 两个三角形组成一个矩形墙面
          indices.push(curr, next, curr + 1);
          indices.push(curr + 1, next, next + 1);
        }
      }

      // 墙体 Mesh
      const wallGeo = new THREE.BufferGeometry();
      wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      wallGeo.setIndex(indices);
      wallGeo.computeVertexNormals();

      const wallMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        emissive: 0xfacc15,
        emissiveIntensity: 0.2,
      });

      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.name = 'boundary_walls';
      sceneRef.current.add(wallMesh);

      // 墙顶高亮线
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
      const topLine = new THREE.Line(lineGeo, lineMat);
      topLine.name = 'boundary_top_line';
      sceneRef.current.add(topLine);
    }

    // 3. 渲染分析结果
    if (result && mesh2?.grid) {
      const baseModel = createBaseModel(mesh2.grid, refOrigin);
      sceneRef.current.add(baseModel);

      const { diffMap, gridSize } = result;
      const { data, rows, cols, minX, minY } = diffMap;
      const positions: number[] = [];
      const colors: number[] = [];
      
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const diff = data[r * cols + c];
          if (Math.abs(diff) < 0.01) continue; 

          const px = (minX + c * gridSize) - refOrigin.x;
          const py = -((minY + r * gridSize) - refOrigin.y); 
          const h2 = mesh2.grid.heights[r * cols + c];
          if (h2 < -900000) continue;
          
          const pz = h2 - refOrigin.z + 0.08; 

          positions.push(px, pz, py);

          if (diff > 0.05) colors.push(0.9, 0.2, 0.2); 
          else if (diff < -0.05) colors.push(0.2, 0.4, 0.9);
          else colors.push(0.4, 0.4, 0.4);
        }
      }

      if (positions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const material = new THREE.PointsMaterial({ 
          vertexColors: true, 
          size: gridSize * 0.9, 
          sizeAttenuation: true,
          depthWrite: false
        });
        const viz = new THREE.Points(geometry, material);
        viz.name = 'result_viz';
        sceneRef.current.add(viz);

        const box = new THREE.Box3().setFromObject(viz);
        const center = box.getCenter(new THREE.Vector3());
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }
    } 
    // 4. 预览阶段
    else {
      const renderPreview = (grid: GridData, color: number, name: string) => {
        const { heights, rows, cols, minX, minY, gridSize } = grid;
        const pos: number[] = [];
        for(let i=0; i<heights.length; i++) {
          if (heights[i] < -900000) continue;
          const r = Math.floor(i / cols);
          const c = i % cols;
          pos.push(
            (minX + c*gridSize) - refOrigin.x, 
            heights[i] - refOrigin.z, 
            -((minY + r*gridSize) - refOrigin.y)
          );
        }
        if (pos.length === 0) return null;
        const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({ color, size: gridSize * 0.5 });
        const p = new THREE.Points(geo, mat);
        p.name = name;
        sceneRef.current?.add(p);
        return p;
      };

      let focusObj: THREE.Object3D | null = sceneRef.current.getObjectByName('boundary_walls') || null;
      if (mesh1?.grid) focusObj = renderPreview(mesh1.grid, 0x3b82f6, 'grid1') || focusObj;
      if (mesh2?.grid) focusObj = renderPreview(mesh2.grid, 0xef4444, 'grid2') || focusObj;
      
      if (focusObj) {
        const box = new THREE.Box3().setFromObject(focusObj);
        const center = box.getCenter(new THREE.Vector3());
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }
    }
  }, [mesh1?.grid, mesh2?.grid, result, boundary]);

  return <div ref={mountRef} className="flex-1 w-full h-full" />;
};
