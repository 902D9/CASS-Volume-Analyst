
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { VolumeResult, MeshData, GridData, BoundaryPoint, Point3D } from '../types';

interface Props {
  mesh1: MeshData | null;
  mesh2: MeshData | null;
  result: VolumeResult | null;
  boundary: BoundaryPoint[] | null;
}

type ViewMode = 'TOP' | 'FRONT' | 'LEFT' | 'RIGHT' | 'ISO';
type CameraType = 'PERSPECTIVE' | 'ORTHOGRAPHIC';

export const Visualizer: React.FC<Props> = ({ mesh1, mesh2, result, boundary }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthographicCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const [activeCameraType, setActiveCameraType] = useState<CameraType>('PERSPECTIVE');
  
  const boundsRef = useRef<THREE.Box3>(new THREE.Box3());

  // Initialization: Only runs ONCE on mount
  useEffect(() => {
    if (!mountRef.current) return;
    
    const scene = sceneRef.current;
    scene.background = new THREE.Color(0x020617); 

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const aspect = width / height;

    // 1. Perspective Camera
    const pCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000000);
    pCamera.position.set(1000, 1000, 1000);
    perspectiveCameraRef.current = pCamera;

    // 2. Orthographic Camera
    const frustumSize = 1000;
    const oCamera = new THREE.OrthographicCamera(
      frustumSize * aspect / -2, frustumSize * aspect / 2,
      frustumSize / 2, frustumSize / -2,
      0.1, 1000000
    );
    oCamera.position.set(1000, 1000, 1000);
    orthographicCameraRef.current = oCamera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(pCamera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(2000, 5000, 2000);
    scene.add(sun);

    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      
      // Select camera based on current state (state ref is needed for the loop or just closure)
      // Since setActiveCameraType triggers re-render, we use a ref for the type to be safe in the loop
      // but standard React state works fine here if we handle it inside the loop correctly.
      const activeCam = controls.object; 
      // Fix: Cast controls.object to THREE.Camera as renderer.render expects a Camera type.
      renderer.render(scene, activeCam as THREE.Camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      const asp = w / h;

      pCamera.aspect = asp;
      pCamera.updateProjectionMatrix();

      // We update ortho camera if it's currently active or about to be
      const fSize = getTargetFrustumSize();
      oCamera.left = -fSize * asp / 2;
      oCamera.right = fSize * asp / 2;
      oCamera.top = fSize / 2;
      oCamera.bottom = -fSize / 2;
      oCamera.updateProjectionMatrix();

      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  const getTargetFrustumSize = () => {
    if (boundsRef.current.isEmpty()) return 1000;
    const size = new THREE.Vector3();
    boundsRef.current.getSize(size);
    return Math.max(size.x, size.y, size.z) * 1.5;
  };

  const syncCameras = (from: THREE.Camera, to: THREE.Camera) => {
    to.position.copy(from.position);
    to.quaternion.copy(from.quaternion);
    if (controlsRef.current) {
      to.lookAt(controlsRef.current.target);
    }
  };

  const setView = (mode: ViewMode) => {
    if (!perspectiveCameraRef.current || !orthographicCameraRef.current || !controlsRef.current) return;
    
    const targetType: CameraType = mode === 'ISO' ? 'PERSPECTIVE' : 'ORTHOGRAPHIC';
    const target = controlsRef.current.target.clone();
    
    const size = new THREE.Vector3();
    boundsRef.current.getSize(size);
    const distance = Math.max(size.x, size.y, size.z) * 1.5 || 500;

    const cam = targetType === 'PERSPECTIVE' ? perspectiveCameraRef.current : orthographicCameraRef.current;
    controlsRef.current.object = cam;

    if (targetType === 'ORTHOGRAPHIC') {
      const oCam = cam as THREE.OrthographicCamera;
      const asp = perspectiveCameraRef.current.aspect;
      const fSize = getTargetFrustumSize();
      oCam.left = -fSize * asp / 2;
      oCam.right = fSize * asp / 2;
      oCam.top = fSize / 2;
      oCam.bottom = -fSize / 2;
      oCam.updateProjectionMatrix();
    }

    switch (mode) {
      case 'TOP':
        cam.position.set(target.x, target.y + distance, target.z);
        break;
      case 'FRONT':
        cam.position.set(target.x, target.y, target.z + distance);
        break;
      case 'LEFT':
        cam.position.set(target.x - distance, target.y, target.z);
        break;
      case 'RIGHT':
        cam.position.set(target.x + distance, target.y, target.z);
        break;
      case 'ISO':
        const isoDist = distance * 0.707;
        cam.position.set(target.x + isoDist, target.y + isoDist, target.z + isoDist);
        break;
    }
    
    cam.lookAt(target);
    controlsRef.current.update();
    setActiveCameraType(targetType);
  };

  const toggleCameraType = () => {
    if (!perspectiveCameraRef.current || !orthographicCameraRef.current || !controlsRef.current) return;
    
    const nextType = activeCameraType === 'PERSPECTIVE' ? 'ORTHOGRAPHIC' : 'PERSPECTIVE';
    const fromCam = activeCameraType === 'PERSPECTIVE' ? perspectiveCameraRef.current : orthographicCameraRef.current;
    const toCam = nextType === 'PERSPECTIVE' ? perspectiveCameraRef.current : orthographicCameraRef.current;
    
    syncCameras(fromCam, toCam);
    controlsRef.current.object = toCam;
    
    if (nextType === 'ORTHOGRAPHIC') {
      const oCam = toCam as THREE.OrthographicCamera;
      const fSize = getTargetFrustumSize();
      const asp = perspectiveCameraRef.current.aspect;
      oCam.left = -fSize * asp / 2;
      oCam.right = fSize * asp / 2;
      oCam.top = fSize / 2;
      oCam.bottom = -fSize / 2;
      oCam.updateProjectionMatrix();
    }
    
    setActiveCameraType(nextType);
  };

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
        const lx = minX + c * gridSize;
        const ly = minY + r * gridSize;
        const gx = lx * cos - ly * sin + anchor.x;
        const gy = lx * sin + ly * cos + anchor.y;
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

  // Content Update: Syncs meshes/boundary to the persistent scene
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !controlsRef.current) return;

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
      boundsRef.current = box;
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }
    }
  }, [mesh1?.grid, mesh2?.grid, result, boundary]);

  return (
    <div ref={mountRef} className="flex-1 w-full h-full relative">
      <div className="absolute top-6 right-6 flex flex-col gap-2 z-10 scale-90 sm:scale-100">
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-xl p-1 shadow-2xl flex flex-col gap-1 text-slate-300">
          <button onClick={() => setView('TOP')} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-indigo-600 hover:text-white transition-colors text-[10px] font-bold" title="正交顶视图">顶</button>
          <button onClick={() => setView('FRONT')} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-indigo-600 hover:text-white transition-colors text-[10px] font-bold" title="正交前视图">前</button>
          <button onClick={() => setView('LEFT')} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-indigo-600 hover:text-white transition-colors text-[10px] font-bold" title="正交左视图">左</button>
          <button onClick={() => setView('RIGHT')} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-indigo-600 hover:text-white transition-colors text-[10px] font-bold" title="正交右视图">右</button>
          <div className="h-px bg-slate-700 mx-1 my-1"></div>
          <button onClick={() => setView('ISO')} className="w-10 h-10 flex items-center justify-center rounded-lg bg-indigo-600/50 hover:bg-indigo-600 hover:text-white transition-colors text-[10px] font-bold" title="透视轴测图">轴</button>
        </div>

        <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-xl p-1 shadow-2xl">
          <button 
            onClick={toggleCameraType} 
            className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-all ${activeCameraType === 'ORTHOGRAPHIC' ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-400'}`}
          >
            <span className="text-[10px] font-black">{activeCameraType === 'PERSPECTIVE' ? '透视' : '正交'}</span>
            <div className={`w-1 h-1 rounded-full mt-0.5 ${activeCameraType === 'ORTHOGRAPHIC' ? 'bg-white' : 'bg-blue-400'}`}></div>
          </button>
        </div>
      </div>
    </div>
  );
};
