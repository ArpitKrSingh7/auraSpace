'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3 } from 'three';
import type { SceneProps } from '@/domain/types';
import { SceneWorld, useSceneCamera, canWalkTo } from './SceneWorld';

function CameraManager({
  mode,
  room,
  items,
  walkingTarget,
  onWalkFinished,
}: {
  mode: SceneProps['mode'];
  room: SceneProps['project']['room'];
  items: SceneProps['project']['items'];
  walkingTarget: { x: number; z: number } | null;
  onWalkFinished: () => void;
}) {
  const camera = useSceneCamera(mode, room, items);
  const targetVec = useRef(new Vector3());

  useFrame((_, delta) => {
    if (mode === 'inside' && walkingTarget) {
      const eyeY = Math.min(1.55, room.height * 0.7);
      targetVec.current.set(walkingTarget.x, eyeY, walkingTarget.z);
      const currentPos = camera.position;
      const dist = currentPos.distanceTo(targetVec.current);
      if (dist > 0.05) {
        currentPos.lerp(targetVec.current, Math.min(1, delta * 6.5));
      } else {
        currentPos.copy(targetVec.current);
        onWalkFinished();
      }
    }
  });

  return null;
}

export default function SceneCanvas(props: SceneProps) {
  const { project, mode, placing } = props;
  const room = project.room;
  const [isInteracting, setIsInteracting] = useState(false);
  const [walkingTarget, setWalkingTarget] = useState<{ x: number; z: number } | null>(null);
  const controlsRef = useRef<any>(null);

  const handleWalk = useCallback(
    (targetX: number, targetZ: number) => {
      if (mode !== 'inside') return;
      if (!canWalkTo(targetX, targetZ, room, project.items)) return;
      setWalkingTarget({ x: targetX, z: targetZ });
    },
    [mode, room, project.items]
  );

  // Reset orbit target when room dimensions or view mode changes
  useEffect(() => {
    if (controlsRef.current && mode === 'overview') {
      controlsRef.current.target.set(room.width / 2, 0.45, room.depth / 2);
      controlsRef.current.update();
    }
  }, [room.width, room.depth, mode]);

  const orbitEnabled = mode === 'overview' && !isInteracting && !placing;

  return (
    <div className="w-full h-full relative select-none">
      <Canvas
        shadows
        gl={{
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
          powerPreference: 'high-performance',
        }}
        dpr={[1, 2]}
        className="w-full h-full"
      >
        <CameraManager
          mode={mode}
          room={room}
          items={project.items}
          walkingTarget={walkingTarget}
          onWalkFinished={() => setWalkingTarget(null)}
        />

        {mode === 'overview' && (
          <OrbitControls
            ref={controlsRef}
            enabled={orbitEnabled}
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI / 2 - 0.04}
            minDistance={1.5}
            maxDistance={Math.max(room.width, room.depth) * 4.5}
            target={[room.width / 2, 0.45, room.depth / 2]}
          />
        )}

        <SceneWorld
          {...props}
          onInteractionChange={setIsInteracting}
          onWalk={handleWalk}
        />
      </Canvas>

      {/* Mode Hint Overlay */}
      <div className="absolute top-3 left-3 pointer-events-none">
        <div className="bg-white/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-surface-200/60 shadow-sm text-[11px] text-surface-600 font-medium">
          {mode === 'inside' && '👀 Inside View · Tap anywhere on the floor to walk'}
          {mode === 'overview' && '🔄 Overview 3D · Drag to orbit · Scroll to zoom'}
          {mode === 'plan' && '📐 2D Top-Down Plan · Orthographic projection'}
        </div>
      </div>
    </div>
  );
}
