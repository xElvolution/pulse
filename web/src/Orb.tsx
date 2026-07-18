import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Heartbeat envelope: two quick bumps (lub-dub) then rest, like a real cardiac cycle.
const HEARTBEAT_GLSL = /* glsl */ `
  float beatEnvelope(float t) {
    float lub = exp(-pow((t - 0.12) * 18.0, 2.0));
    float dub = 0.55 * exp(-pow((t - 0.34) * 16.0, 2.0));
    return lub + dub;
  }
`

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uBeat;      // 0..1 envelope from JS clock
  uniform float uVitality;  // 1 = fresh heartbeat, 0 = flatlined
  varying vec3 vNormal;
  varying vec3 vPos;
  varying float vDisp;

  // Simplex-ish cheap noise
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);
    // Organic surface churn, calmer as vitality drops
    float n = noise(position * 2.4 + uTime * (0.25 + 0.45 * uVitality));
    // Systolic expansion on each beat
    float disp = n * 0.10 * (0.3 + 0.7 * uVitality) + uBeat * 0.16 * uVitality;
    vDisp = disp;
    vec3 p = position + normal * disp;
    vPos = (modelViewMatrix * vec4(p, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uBeat;
  uniform float uVitality;
  varying vec3 vNormal;
  varying vec3 vPos;
  varying float vDisp;

  void main() {
    vec3 viewDir = normalize(-vPos);
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.2);

    // Alive: hot coral/crimson. Dying: cold cyan-slate. Dead: ash.
    vec3 alive = vec3(1.0, 0.22, 0.30);
    vec3 dying = vec3(0.16, 0.45, 0.62);
    vec3 dead  = vec3(0.16, 0.17, 0.20);
    vec3 base = mix(dying, alive, smoothstep(0.25, 0.85, uVitality));
    base = mix(dead, base, smoothstep(0.0, 0.12, uVitality));

    vec3 col = base * (0.35 + 0.65 * fresnel);
    col += base * uBeat * 0.9;            // flash on systole
    col += vec3(1.0, 0.85, 0.8) * fresnel * fresnel * 0.35 * uVitality;
    col += vDisp * base * 1.5;

    gl_FragColor = vec4(col, 1.0);
  }
`

function beatEnvelopeJS(t: number): number {
  const lub = Math.exp(-(((t - 0.12) * 18) ** 2))
  const dub = 0.55 * Math.exp(-(((t - 0.34) * 16) ** 2))
  return lub + dub
}

function Heart({ vitality }: { vitality: number }) {
  const mesh = useRef<THREE.Mesh>(null!)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBeat: { value: 0 },
      uVitality: { value: 1 },
    }),
    [],
  )
  const cycle = useRef(0)

  useFrame((_, delta) => {
    uniforms.uTime.value += delta
    // Ease vitality so state changes breathe instead of snapping
    uniforms.uVitality.value += (vitality - uniforms.uVitality.value) * 0.04

    const v = uniforms.uVitality.value
    // 72bpm when healthy, slowing toward stillness; flatlined = no beat at all
    const bps = v <= 0.02 ? 0 : (0.35 + 0.85 * v)
    cycle.current = (cycle.current + delta * bps) % 1
    uniforms.uBeat.value = v <= 0.02 ? 0 : beatEnvelopeJS(cycle.current)

    mesh.current.rotation.y += delta * 0.12
    mesh.current.rotation.x = Math.sin(uniforms.uTime.value * 0.2) * 0.08
  })

  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1.35, 64]} />
      <shaderMaterial
        vertexShader={HEARTBEAT_GLSL + vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  )
}

function Halo({ vitality }: { vitality: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null!)
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uVitality: { value: 1 } }),
    [],
  )
  useFrame((_, delta) => {
    uniforms.uTime.value += delta
    uniforms.uVitality.value += (vitality - uniforms.uVitality.value) * 0.04
  })
  return (
    <mesh scale={2.6}>
      <sphereGeometry args={[1, 32, 32]} />
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        vertexShader={/* glsl */ `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform float uVitality;
          varying vec3 vNormal;
          void main() {
            float glow = pow(max(vNormal.z, 0.0), 3.0);
            vec3 alive = vec3(1.0, 0.25, 0.32);
            vec3 dying = vec3(0.2, 0.45, 0.6);
            vec3 col = mix(dying, alive, smoothstep(0.25, 0.85, uVitality));
            gl_FragColor = vec4(col, glow * 0.35 * (0.2 + 0.8 * uVitality));
          }
        `}
        uniforms={uniforms}
      />
    </mesh>
  )
}

function Particles({ vitality }: { vitality: number }) {
  const points = useRef<THREE.Points>(null!)
  const count = 900
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 2.2 + Math.random() * 3.5
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [])

  useFrame((_, delta) => {
    points.current.rotation.y += delta * 0.02 * (0.3 + vitality)
    ;(points.current.material as THREE.PointsMaterial).opacity = 0.15 + 0.35 * vitality
  })

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.02} color="#ff5566" transparent opacity={0.4} sizeAttenuation />
    </points>
  )
}

/** vitality: 1 = just checked in, 0 = flatlined */
export default function Orb({ vitality }: { vitality: number }) {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <Heart vitality={vitality} />
      <Halo vitality={vitality} />
      <Particles vitality={vitality} />
    </Canvas>
  )
}
