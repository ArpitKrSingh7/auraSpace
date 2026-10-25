'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3 } from 'three';
import type { SceneProps } from '@/domain/types';
import {
  SceneWorld,
  useSceneCamera,
  canWalkTo,
  clearWalkPath,
} from './SceneWorld';

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
  const { invalidate } = useThree();
  useEffect(() => {
    if (walkingTarget) invalidate();
  }, [walkingTarget, invalidate]);
  const targetVec = useRef(new Vector3());

  useFrame((_, delta) => {
    if (mode === 'inside' && walkingTarget) {
      if (
        !clearWalkPath(
          { x: camera.position.x, z: camera.position.z },
          walkingTarget,
          room,
          items,
        )
      ) {
        onWalkFinished();
        return;
      }
      const eyeY = Math.min(1.55, room.height * 0.7);
      targetVec.current.set(walkingTarget.x, eyeY, walkingTarget.z);
      const currentPos = camera.position;
      const dist = currentPos.distanceTo(targetVec.current);
      if (dist > 0.05) {
        currentPos.lerp(targetVec.current, Math.min(1, delta * 6.5));
        invalidate();
      } else {
        currentPos.copy(targetVec.current);
        onWalkFinished();
      }
    }
  });

  return null;
}

function InsideLook({ enabled }: { enabled: boolean }) {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    if (!enabled) return;
    let pointer: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button === 0) pointer = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!pointer) return;
      camera.rotation.order = 'YXZ';
      camera.rotation.y -= (e.clientX - pointer.x) * 0.004;
      camera.rotation.x = Math.max(
        -1.1,
        Math.min(1.1, camera.rotation.x - (e.clientY - pointer.y) * 0.004),
      );
      pointer = { x: e.clientX, y: e.clientY };
      invalidate();
    };
    const up = () => {
      pointer = null;
    };
    gl.domElement.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      gl.domElement.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [enabled, camera, gl, invalidate]);
  return null;
}

export default function SceneCanvas(props: SceneProps) {
  const { project, mode, placing } = props;
  const room = project.room;
  const [isInteracting, setIsInteracting] = useState(false);
  const [walkingTarget, setWalkingTarget] = useState<{
    x: number;
    z: number;
  } | null>(null);
  const controlsRef = useRef<any>(null);

  const handleWalk = useCallback(
    (targetX: number, targetZ: number) => {
      if (mode !== 'inside') return;
      if (!canWalkTo(targetX, targetZ, room, project.items)) return;
      setWalkingTarget({ x: targetX, z: targetZ });
    },
    [mode, room, project.items],
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
        frameloop="demand"
        shadows
        gl={{
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
          powerPreference: 'high-performance',
        }}
        dpr={[1, 1.5]}
        className="w-full h-full"
      >
        <CameraManager
          mode={mode}
          room={room}
          items={project.items}
          walkingTarget={walkingTarget}
          onWalkFinished={() => setWalkingTarget(null)}
        />

        {mode === 'inside' && (
          <InsideLook enabled={!isInteracting && !placing && !walkingTarget} />
        )}

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

      <div className="pointer-events-none absolute bottom-3 right-4 hidden text-[10px] text-surface-500 sm:block">
        {mode === 'inside'
          ? 'Drag to look · Tap the floor to walk'
          : mode === 'overview'
            ? 'Drag to orbit · Scroll to zoom'
            : 'Select and drag a piece to arrange'}
      </div>
    </div>
  );
}
