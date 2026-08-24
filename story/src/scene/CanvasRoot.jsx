import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Robot } from "./Robot.jsx";
import { story, POSES, blendIndex, mixPose } from "./store.js";

function Rig() {
  const light = useRef();
  useFrame((state) => {
    const { i, t, j } = blendIndex(story.progress, POSES.length);
    const pose = mixPose(POSES[i], POSES[j], t);
    if (story.mobile) {
      state.camera.position.set(0, 1.1, 9.5);
      state.camera.lookAt(0, 0.4, 0);
    } else {
      state.camera.position.lerp(
        { x: pose.cam[0], y: pose.cam[1], z: pose.cam[2] },
        story.reduced ? 1 : 0.08
      );
      state.camera.lookAt(pose.look[0], pose.look[1], pose.look[2]);
    }
  });
  return (
    <>
      <color attach="background" args={["#070d18"]} />
      <fog attach="fog" args={["#070d18", 8, 22]} />
      <ambientLight intensity={0.18} />
      <directionalLight ref={light} intensity={1.15} color="#cfe8ff" position={[2, 4, 6]} />
      <pointLight position={[-3, 1.5, 2]} intensity={1.4} color="#00a3ff" />
      <pointLight position={[4, -1, -2]} intensity={0.4} color="#4dc4ff" />
      <Robot />
      {!story.reduced ? (
        <Sparkles count={story.mobile ? 18 : 42} scale={[12, 6, 8]} size={2.4} speed={0.25} color="#4dc4ff" opacity={0.45} />
      ) : null}
    </>
  );
}

function Effects() {
  if (story.reduced || story.mobile) return null;
  return (
    <EffectComposer disableNormalPass>
      <Bloom luminanceThreshold={0.72} intensity={0.55} mipmapBlur />
    </EffectComposer>
  );
}

export function CanvasRoot() {
  const dpr = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches ? 1 : [1, 1.6];
  return (
    <div className="canvas-root" aria-hidden="true">
      <Canvas
        camera={{ position: [0.2, 0.55, 13.5], fov: 38, near: 0.1, far: 40 }}
        dpr={dpr}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <Rig />
        <Effects />
      </Canvas>
    </div>
  );
}
