'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Auto-rotating 3D Earth rendered with plain three.js (no react-three-fiber).
 * Deliberately avoids @react-three/fiber: its react-reconciler couples to a
 * specific React version, and Next.js 15's App Router runs a vendored React 19,
 * which crashed fiber's reconciler. Vanilla three.js has no React dependency.
 */
export default function EarthCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const getSize = () => ({
      width: mount.clientWidth || 1,
      height: mount.clientHeight || 1,
    });
    const { width, height } = getSize();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    camera.position.set(-4, 3, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.4;
    controls.minPolarAngle = Math.PI / 2;
    controls.maxPolarAngle = Math.PI / 2;

    let earth: THREE.Object3D | null = null;
    const loader = new GLTFLoader();
    loader.load(
      '/planet/scene.gltf',
      (gltf) => {
        earth = gltf.scene;
        earth.scale.set(2.5, 2.5, 2.5);
        scene.add(earth);
        setLoaded(true);
      },
      undefined,
      (err) => console.error('Failed to load Earth model', err),
    );

    let raf = 0;
    const renderLoop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    const handleResize = () => {
      const size = getSize();
      camera.aspect = size.width / size.height;
      camera.updateProjectionMatrix();
      renderer.setSize(size.width, size.height);
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      controls.dispose();
      if (earth) scene.remove(earth);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div ref={mountRef} className="relative h-full w-full">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          …
        </div>
      )}
    </div>
  );
}
