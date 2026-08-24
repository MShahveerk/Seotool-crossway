import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { story, POSES, blendIndex, mixPose } from "./store.js";

const WHITE = "#eef3f8";
const NAVY = "#0a1628";
const NEON = "#00a3ff";
const EYE = "#7ad4ff";

function Mat({ color, emissive, emissiveIntensity = 0, roughness = 0.28, metalness = 0.12, ...rest }) {
  return (
    <meshPhysicalMaterial
      color={color}
      emissive={emissive || "#000000"}
      emissiveIntensity={emissiveIntensity}
      roughness={roughness}
      metalness={metalness}
      clearcoat={0.55}
      clearcoatRoughness={0.25}
      {...rest}
    />
  );
}

export function Robot() {
  const root = useRef();
  const ring = useRef();
  const glass = useRef();
  const charts = useRef();
  const stars = useRef();
  const papers = useRef();
  const tiles = useRef();
  const reports = useRef();
  const spot = useRef();
  const armL = useRef();
  const armR = useRef();
  const bars = useMemo(
    () =>
      [0, 1, 2].map((i) => ({
        x: 1.15 + i * 0.22,
        h: 0.35 + i * 0.22,
      })),
    []
  );
  const starPts = useMemo(() => {
    const pts = [];
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      pts.push([Math.cos(a) * 2.1, Math.sin(a * 1.7) * 0.55, Math.sin(a) * 2.1]);
    }
    return pts;
  }, []);

  useFrame((state, delta) => {
    const { i, t, j } = blendIndex(story.progress, POSES.length);
    const pose = mixPose(POSES[i], POSES[j], t);
    const breathe = story.reduced ? 0 : Math.sin(state.clock.elapsedTime * 1.4) * 0.03;
    if (root.current) {
      root.current.position.set(pose.robot[0], pose.robot[1] + breathe, pose.robot[2]);
      root.current.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2]);
      const s = pose.scale;
      root.current.scale.setScalar(s);
    }
    if (ring.current) {
      ring.current.rotation.y += story.reduced ? 0 : delta * 0.35;
      ring.current.rotation.x = 1.15;
      ring.current.scale.setScalar(0.7 + pose.ring * 0.55);
      ring.current.visible = pose.ring > 0.04;
    }
    if (glass.current) {
      glass.current.visible = pose.glass > 0.08;
      glass.current.rotation.z = -0.4;
      glass.current.position.set(0.55, 0.15, 0.55);
      if (armR.current) armR.current.rotation.z = THREE.MathUtils.lerp(-0.15, -0.85, pose.glass);
    }
    if (armL.current) {
      armL.current.rotation.z = THREE.MathUtils.lerp(0.2, 0.55, pose.charts);
    }
    if (charts.current) {
      charts.current.visible = pose.charts > 0.08;
      charts.current.scale.setScalar(pose.charts);
    }
    if (stars.current) {
      stars.current.visible = pose.stars > 0.08;
      stars.current.rotation.y += story.reduced ? 0 : delta * 0.22;
      stars.current.scale.setScalar(pose.stars);
    }
    if (papers.current) {
      papers.current.visible = pose.papers > 0.08;
      papers.current.rotation.y = -0.4;
      papers.current.scale.setScalar(pose.papers);
    }
    if (tiles.current) {
      tiles.current.visible = pose.tiles > 0.08;
      tiles.current.scale.setScalar(pose.tiles);
    }
    if (reports.current) {
      reports.current.visible = pose.reports > 0.08;
      reports.current.scale.setScalar(pose.reports);
    }
    if (spot.current) {
      spot.current.visible = pose.spot > 0.12;
      spot.current.intensity = pose.spot * 8;
    }
    if (pose.rest > 0.4 && armR.current) {
      armR.current.rotation.z = THREE.MathUtils.lerp(armR.current.rotation.z, 0.9, 0.08);
    }
  });

  return (
    <group ref={root}>
      <mesh position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.52, 32, 32]} />
        <Mat color={WHITE} />
      </mesh>
      <mesh position={[-0.18, 1.1, 0.42]} scale={[1, 0.72, 0.45]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <Mat color={EYE} emissive={NEON} emissiveIntensity={1.8} roughness={0.15} />
      </mesh>
      <mesh position={[0.18, 1.1, 0.42]} scale={[1, 0.72, 0.45]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <Mat color={EYE} emissive={NEON} emissiveIntensity={1.8} roughness={0.15} />
      </mesh>
      <mesh position={[-0.48, 1.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.14, 0.14, 0.08, 24]} />
        <Mat color={NAVY} metalness={0.4} />
      </mesh>
      <mesh position={[0.48, 1.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.14, 0.14, 0.08, 24]} />
        <Mat color={NAVY} metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.58, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.28, 8]} />
        <Mat color={NAVY} />
      </mesh>
      <mesh position={[0, 1.76, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <Mat color={NEON} emissive={NEON} emissiveIntensity={2.2} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <capsuleGeometry args={[0.34, 0.55, 8, 16]} />
        <Mat color={WHITE} />
      </mesh>
      <group ref={armL} position={[-0.46, 0.55, 0]} rotation={[0, 0, 0.25]}>
        <mesh position={[0, -0.28, 0]}>
          <capsuleGeometry args={[0.08, 0.38, 6, 12]} />
          <Mat color={WHITE} />
        </mesh>
        <mesh position={[0, -0.08, 0]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <Mat color={NEON} emissive={NEON} emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[-0.04, -0.55, 0.06]} rotation={[0.4, 0, 0.4]}>
          <capsuleGeometry args={[0.03, 0.12, 4, 8]} />
          <Mat color={WHITE} />
        </mesh>
        <mesh position={[0.02, -0.56, 0.08]} rotation={[0.5, 0, 0]}>
          <capsuleGeometry args={[0.03, 0.13, 4, 8]} />
          <Mat color={WHITE} />
        </mesh>
        <mesh position={[0.08, -0.54, 0.04]} rotation={[0.35, 0, -0.35]}>
          <capsuleGeometry args={[0.03, 0.11, 4, 8]} />
          <Mat color={WHITE} />
        </mesh>
      </group>
      <group ref={armR} position={[0.46, 0.55, 0]} rotation={[0, 0, -0.25]}>
        <mesh position={[0, -0.28, 0]}>
          <capsuleGeometry args={[0.08, 0.38, 6, 12]} />
          <Mat color={WHITE} />
        </mesh>
        <mesh position={[0, -0.08, 0]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <Mat color={NEON} emissive={NEON} emissiveIntensity={0.6} />
        </mesh>
        <group ref={glass} position={[0.12, -0.52, 0.22]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.22, 0.035, 12, 28]} />
            <Mat color={NAVY} metalness={0.5} />
          </mesh>
          <mesh>
            <circleGeometry args={[0.18, 24]} />
            <meshPhysicalMaterial
              color="#4dc4ff"
              transparent
              opacity={0.28}
              transmission={0.7}
              roughness={0.05}
              thickness={0.2}
            />
          </mesh>
          <mesh position={[0.18, -0.18, 0]} rotation={[0, 0, 0.7]}>
            <cylinderGeometry args={[0.03, 0.03, 0.28, 8]} />
            <Mat color={NAVY} />
          </mesh>
        </group>
      </group>
      <mesh position={[-0.16, -0.42, 0.02]} rotation={[0, 0, 0.12]}>
        <capsuleGeometry args={[0.1, 0.38, 6, 12]} />
        <Mat color={WHITE} />
      </mesh>
      <mesh position={[0.16, -0.42, 0.02]} rotation={[0, 0, -0.12]}>
        <capsuleGeometry args={[0.1, 0.38, 6, 12]} />
        <Mat color={WHITE} />
      </mesh>

      <mesh ref={ring} position={[0, 0.55, 0]}>
        <torusGeometry args={[1.45, 0.028, 12, 64]} />
        <meshPhysicalMaterial
          color={NEON}
          emissive={NEON}
          emissiveIntensity={0.85}
          roughness={0.15}
          metalness={0.2}
          transmission={0.45}
          thickness={0.35}
          transparent
          opacity={0.9}
        />
      </mesh>

      <group ref={charts} position={[1.05, 0.35, 0.2]}>
        {bars.map((b, idx) => (
          <mesh key={idx} position={[idx * 0.22, b.h / 2, 0]}>
            <boxGeometry args={[0.14, b.h, 0.14]} />
            <Mat color={NEON} emissive={NEON} emissiveIntensity={0.7} />
          </mesh>
        ))}
        <mesh position={[0.22, 0.72, 0]} rotation={[0, 0, 0.4]}>
          <boxGeometry args={[0.7, 0.04, 0.04]} />
          <Mat color={EYE} emissive={NEON} emissiveIntensity={1.2} />
        </mesh>
      </group>

      <group ref={stars}>
        {starPts.map((p, idx) => (
          <mesh key={idx} position={p}>
            <sphereGeometry args={[0.045, 8, 8]} />
            <Mat color={EYE} emissive={NEON} emissiveIntensity={1.4} />
          </mesh>
        ))}
      </group>

      <group ref={papers} position={[1.15, 0.2, 0.15]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[i * 0.04, i * 0.08, -i * 0.05]} rotation={[0.4, 0.3, i * 0.08]}>
            <boxGeometry args={[0.55, 0.72, 0.02]} />
            <Mat color={i % 2 ? WHITE : "#d7e7f5"} roughness={0.55} />
          </mesh>
        ))}
      </group>

      <group ref={tiles} position={[1.2, 0.25, 0]}>
        {["#1877F2", "#E1306C", "#FF0000"].map((c, i) => (
          <mesh key={c} position={[0, i * 0.38 - 0.3, i * 0.08]} rotation={[0.1, -0.4, 0]}>
            <boxGeometry args={[0.7, 0.32, 0.06]} />
            <Mat color={c} roughness={0.4} />
          </mesh>
        ))}
      </group>

      <group ref={reports} position={[1.05, 0.15, 0.1]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[i * 0.05, i * 0.04, -i * 0.08]} rotation={[0.15, 0.2, 0]}>
            <boxGeometry args={[0.85, 1.05, 0.03]} />
            <Mat color={i === 1 ? "#0e1624" : WHITE} roughness={0.5} />
          </mesh>
        ))}
      </group>

      <spotLight
        ref={spot}
        position={[0, 3.2, 1.4]}
        angle={0.28}
        penumbra={0.6}
        color={NEON}
        castShadow={false}
      />
    </group>
  );
}
