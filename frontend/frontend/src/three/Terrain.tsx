import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Sky, Stars, Cloud, Float, Text } from '@react-three/drei';
import * as THREE from 'three';

const MountainTerrain = () => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Create a simple mountain-like terrain using a plane geometry and modifying vertices
  const size = 100;
  const segments = 64;

  const generateTerrain = () => {
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Create a central peak with some random noise
      const dist = Math.sqrt(x * x + y * y);
      const height = Math.max(0, (size / 2 - dist) * 0.5) + Math.random() * 2;
      pos.setZ(i, height);
    }
    pos.needsUpdate = true;
    return geo;
  };

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow>
      <primitive object={generateTerrain()} attach="geometry" />
      <meshStandardMaterial
        color="#4B3621"
        flatShading
        roughness={0.8}
        metalness={0.2}
      />
    </mesh>
  );
};

const Scene = () => {
  return (
    <>
      <PerspectiveCamera makeDefault position={[40, 30, 40]} />
      <OrbitControls enableZoom={false} maxPolarAngle={Math.PI / 2.1} />

      <Sky sunPosition={[100, 20, 100]} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1.2} castShadow />
      <fog attach="fog" args={['#1B4332', 10, 150]} />

      <Float speed={2} rotationIntensity={0.1} floatIntensity={0.1}>
        <MountainTerrain />
      </Float>

      <Text
        position={[0, 15, 0]}
        fontSize={5}
        color="#F5F5DC"
        anchorX="center"
        anchorY="middle"
        font="/fonts/inter-bold.ttf" // Assuming font exists or using default
      >
        TERRAGUARD AI
      </Text>

      <Cloud position={[-20, 10, -10]} speed={0.2} opacity={0.5} />
      <Cloud position={[20, 15, -20]} speed={0.3} opacity={0.4} />
      <Cloud position={[0, 12, -30]} speed={0.1} opacity={0.6} />
    </>
  );
};

export const Terra3DScene: React.FC = () => {
  return (
    <div className="w-full h-screen bg-forest-green">
      <Canvas shadows>
        <Scene />
      </Canvas>
    </div>
  );
};
