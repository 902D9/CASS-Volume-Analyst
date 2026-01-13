
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
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

  const createRotatedGridGroup = (grid: GridData, globalOrigin: Point3D, color: number, diffData?: Float32Array) => {
    const { heights, rows, cols, minX, minY, gridSize, rotationAngle, anchor } = grid;
    const positions: number[] = [];
    const nodeColors: number[] = [];
    const NO_DATA = -1000000;

    const cos = Math.cos(rotationAngle);
    const sin = Math.sin(rotationAngle);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const h = heights[idx];
        
        // 局部坐标系点
        const lx = minX + c * gridSize;
        const ly = minY + r * gridSize;

        // 旋转回全局坐标
        const gx = lx * cos - ly * sin + anchor.x;
        const gy = lx * sin + ly * cos + anchor.y;

        // 相对于场景原点 (globalOrigin) 的显示坐标
        const dx = gx - globalOrigin.x;
        const dz = -(gy - globalOrigin.y);
        const dy = (h <= NO_DATA ? -50 : h) - globalOrigin.z;

        positions.push(dx, dy, dz);

        if (diffData && h > NO_DATA) {
          const d = diffData[idx] || 0;
          if (d > 0.05) nodeColors.push(0.9, 0.2, 0.2);
          else if (d < -0.05) nodeColors.push(0.2, 0.4, 0.9);
          else nodeColors.push(0.5, 0.5, 0.5);
        } else {
          color === 0x3b82f6 ? nodeColors.push(0.2, 0.4, 0.8) : nodeColors.push(0.8, 0.2, 0.2);
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

    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.3 }));
    group.add(mesh);

    const wireframe = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.4 }));
    wireframe.position.y += 0.02;
    group.add(wireframe);

    const ptPos: number[] = [], ptCol: number[] = [];
    for(let i=0; i<heights.length; i++) {
      if(heights[i] > NO_DATA) {
        ptPos.push(positions[i*3], positions[i*3+1]+0.05, positions[i*3+2]);
        ptCol.push(nodeColors[i*3], nodeColors[i*3+1], nodeColors[i*3+2]);
      }
    }
    const ptGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ptPos, 3)).setAttribute('color', new THREE.Float32BufferAttribute(ptCol, 3));
    group.add(new THREE.Points(ptGeo, new THREE.PointsMaterial({ vertexColors: true, size: 2, sizeAttenuation: true })));

    return group;
  };

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !controlsRef.current) return;

    ['model_1', 'model_2', 'boundary_line'].forEach(n => {
      const obj = scene.getObjectByName(n);
      if (obj) {
        obj.traverse((c: any) => { if(c.geometry) c.geometry.dispose(); if(c.material) Array.isArray(c.material) ? c.material.forEach((m:any)=>m.dispose()) : c.material.dispose(); });
        scene.remove(obj);
      }
    });

    let refOrigin: Point3D = { x: 0, y: 0, z: 0 };
    const baseGrid = mesh1?.grid || mesh2?.grid;
    if (baseGrid) {
      refOrigin = { x: baseGrid.anchor.x, y: baseGrid.anchor.y, z: baseGrid.anchor.z };
    }

    if (mesh1?.grid) {
      const g1 = createRotatedGridGroup(mesh1.grid, refOrigin, 0x3b82f6);
      g1.name = 'model_1';
      scene.add(g1);
    }
    if (mesh2?.grid) {
      const g2 = createRotatedGridGroup(mesh2.grid, refOrigin, 0xef4444, result?.diffMap.data);
      g2.name = 'model_2';
      scene.add(g2);
    }

    if (boundary && boundary.length >= 2) {
      const bPts: THREE.Vector3[] = [];
      boundary.forEach(p => bPts.push(new THREE.Vector3(p.x - refOrigin.x, 2, -(p.y - refOrigin.y))));
      if (boundary.length > 2) bPts.push(bPts[0]);
      const bLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(bPts), new THREE.LineBasicMaterial({ color: 0xfacc15, linewidth: 3 }));
      bLine.name = 'boundary_line';
      scene.add(bLine);
    }

    const allModels = scene.children.filter(c => c.name.startsWith('model_') || c.name === 'boundary_line');
    if (allModels.length > 0) {
      const box = new THREE.Box3();
      allModels.forEach(m => box.expandByObject(m));
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }
    }
  }, [mesh1?.grid, mesh2?.grid, result, boundary]);

  return <div ref={mountRef} className="flex-1 w-full h-full relative" />;
};
