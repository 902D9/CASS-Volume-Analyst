
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

    const camera = new THREE.PerspectiveCamera(50, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000000);
    camera.position.set(500, 500, 500);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);

    // Helpers
    const axesHelper = new THREE.AxesHelper(100);
    scene.add(axesHelper);

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

  // Grid Visualization Logic
  useEffect(() => {
    if (!sceneRef.current || !controlsRef.current || !cameraRef.current) return;

    // Cleanup previous visualizations
    const objects = ['grid1', 'grid2', 'result_viz'];
    objects.forEach(name => {
      const obj = sceneRef.current?.getObjectByName(name);
      if (obj) sceneRef.current?.remove(obj);
    });

    const refOrigin = mesh1?.origin || mesh2?.origin || { x: 0, y: 0, z: 0 };

    const createGridPoints = (grid: GridData, color: number, name: string, yOffset: number = 0) => {
      const { heights, rows, cols, minX, minY, gridSize } = grid;
      const positions: number[] = [];
      
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const h = heights[r * cols + c];
          if (h < -999999) continue; // Skip no-data

          // Geographic -> Scene (relative to refOrigin)
          const sx = (minX + c * gridSize) - refOrigin.x;
          const sy = (minY + r * gridSize) - refOrigin.y;
          const sz = h - refOrigin.z + yOffset;

          positions.push(sx, sz, -sy); // Three.js Y is up, surveying Z is up
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      
      const material = new THREE.PointsMaterial({ 
        color, 
        size: gridSize * 0.8, 
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.8
      });

      const points = new THREE.Points(geometry, material);
      points.name = name;
      sceneRef.current?.add(points);
      return points;
    };

    let targetObj: THREE.Object3D | undefined;

    if (mesh1?.grid) {
      targetObj = createGridPoints(mesh1.grid, 0x60a5fa, 'grid1');
    }

    if (mesh2?.grid) {
      // Offset Epoch 2 slightly for better visual comparison
      const g2 = createGridPoints(mesh2.grid, 0xf87171, 'grid2', 0.5);
      if (!targetObj) targetObj = g2;
    }

    if (targetObj) {
      const box = new THREE.Box3().setFromObject(targetObj);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      
      controlsRef.current.target.copy(center);
      cameraRef.current.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
      controlsRef.current.update();
    }
  }, [mesh1?.grid, mesh2?.grid]);

  return <div ref={mountRef} className="flex-1 w-full h-full" />;
};
