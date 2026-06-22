'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Preload, useGLTF, Html, useProgress } from '@react-three/drei';

function CanvasLoader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <span className="text-sm text-muted-foreground">{progress.toFixed(0)}%</span>
    </Html>
  );
}

function Earth() {
  const earth = useGLTF('/planet/scene.gltf');
  return <primitive object={earth.scene} scale={2.5} position-y={0} rotation-y={0} />;
}

export default function EarthCanvas() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true }}
      camera={{ fov: 45, near: 0.1, far: 200, position: [-4, 3, 6] }}
    >
      <Suspense fallback={<CanvasLoader />}>
        <OrbitControls
          autoRotate
          enablePan={false}
          enableZoom={false}
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={Math.PI / 2}
        />
        <Earth />
        <Preload all />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload('/planet/scene.gltf');
