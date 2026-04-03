import { useState, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Float } from '@react-three/drei';
import { useHealthStore, type RegionStatus } from '../../stores/healthStore';
import { formatDate } from '../../lib/utils';
import * as THREE from 'three';

const REGION_COLORS: Record<RegionStatus, string> = {
  normal: '#22c55e',
  warning: '#f59e0b',
  critical: '#ef4444',
  nodata: '#4b5563',
};

const REGION_GLOW: Record<RegionStatus, number> = {
  normal: 0.3,
  warning: 0.5,
  critical: 0.8,
  nodata: 0.05,
};

/* ─── Grid Floor ─── */
function GridFloor() {
  return (
    <group position={[0, -2.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <gridHelper args={[20, 40, '#1a2744', '#0d1528']} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

/* ─── Scan Line Effect ─── */
function ScanLine() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const t = (clock.elapsedTime * 0.3) % 1;
      meshRef.current.position.y = -2 + t * 8;
      (meshRef.current.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.sin(t * Math.PI) * 0.06;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[0, 0, 0]}>
      <planeGeometry args={[4, 0.02]} />
      <meshBasicMaterial color="#22d3ee" transparent opacity={0.1} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ─── Floating Particles ─── */
function Particles({ count = 60 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 6;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 8;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 4;
    }
    return arr;
  }, [count]);

  useFrame(({ clock }) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = clock.elapsedTime * 0.02;
      const pos = pointsRef.current.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        const y = pos.getY(i);
        pos.setY(i, y + Math.sin(clock.elapsedTime + i) * 0.001);
      }
      pos.needsUpdate = true;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={count} />
      </bufferGeometry>
      <pointsMaterial size={0.03} color="#22d3ee" transparent opacity={0.4} sizeAttenuation />
    </points>
  );
}

/* ─── Body Outer Shell (transparent silhouette) ─── */
function BodyShell() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.15) * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Head */}
      <mesh position={[0, 3.8, 0]}>
        <sphereGeometry args={[0.48, 32, 32]} />
        <meshPhysicalMaterial color="#1a2744" transparent opacity={0.15} roughness={0.3} metalness={0.1} wireframe />
      </mesh>
      {/* Neck */}
      <mesh position={[0, 3.15, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 0.3, 16]} />
        <meshPhysicalMaterial color="#1a2744" transparent opacity={0.12} wireframe />
      </mesh>
      {/* Torso upper */}
      <mesh position={[0, 2.3, 0]}>
        <capsuleGeometry args={[0.55, 0.8, 16, 32]} />
        <meshPhysicalMaterial color="#1a2744" transparent opacity={0.12} roughness={0.4} wireframe />
      </mesh>
      {/* Torso lower */}
      <mesh position={[0, 1.0, 0]}>
        <capsuleGeometry args={[0.48, 0.6, 16, 32]} />
        <meshPhysicalMaterial color="#1a2744" transparent opacity={0.1} wireframe />
      </mesh>
      {/* Left Arm */}
      <group position={[-0.85, 2.5, 0]} rotation={[0, 0, 0.2]}>
        <mesh position={[0, -0.6, 0]}>
          <capsuleGeometry args={[0.12, 1.2, 8, 16]} />
          <meshPhysicalMaterial color="#1a2744" transparent opacity={0.1} wireframe />
        </mesh>
      </group>
      {/* Right Arm */}
      <group position={[0.85, 2.5, 0]} rotation={[0, 0, -0.2]}>
        <mesh position={[0, -0.6, 0]}>
          <capsuleGeometry args={[0.12, 1.2, 8, 16]} />
          <meshPhysicalMaterial color="#1a2744" transparent opacity={0.1} wireframe />
        </mesh>
      </group>
      {/* Left Leg */}
      <mesh position={[-0.28, -0.9, 0]}>
        <capsuleGeometry args={[0.16, 1.8, 8, 16]} />
        <meshPhysicalMaterial color="#1a2744" transparent opacity={0.1} wireframe />
      </mesh>
      {/* Right Leg */}
      <mesh position={[0.28, -0.9, 0]}>
        <capsuleGeometry args={[0.16, 1.8, 8, 16]} />
        <meshPhysicalMaterial color="#1a2744" transparent opacity={0.1} wireframe />
      </mesh>
    </group>
  );
}

/* ─── Interactive Organ Region ─── */
interface BodyRegionProps {
  name: string;
  label: string;
  position: [number, number, number];
  size: number;
  status: RegionStatus;
  selected: boolean;
  onSelect: (name: string) => void;
}

function BodyRegion({ name, label, position, size, status, selected, onSelect }: BodyRegionProps) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const color = REGION_COLORS[status];
  const glowIntensity = REGION_GLOW[status];

  useFrame(({ clock }) => {
    if (meshRef.current) {
      if (status === 'critical') {
        const scale = 1 + Math.sin(clock.elapsedTime * 3) * 0.08;
        meshRef.current.scale.setScalar(scale);
      }
      if (hovered || selected) {
        meshRef.current.scale.lerp(new THREE.Vector3(1.15, 1.15, 1.15), 0.1);
      } else if (status !== 'critical') {
        meshRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
      }
    }
    if (glowRef.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 2) * 0.15;
      glowRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group position={position}>
      {/* Glow sphere (outer) */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[size * 1.8, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={(hovered || selected) ? glowIntensity * 0.4 : glowIntensity * 0.15} />
      </mesh>

      {/* Core organ */}
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onSelect(name); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      >
        <sphereGeometry args={[size, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 1.2 : selected ? 0.8 : glowIntensity}
          transparent
          opacity={hovered ? 0.95 : 0.8}
          roughness={0.2}
          metalness={0.3}
        />
      </mesh>

      {/* Label */}
      {(hovered || selected) && (
        <Float speed={2} floatIntensity={0.3}>
          <Text
            position={[0, size + 0.35, 0]}
            fontSize={0.18}
            color="#e2e8f0"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.015}
            outlineColor="#000000"
            font="/fonts/inter-600.woff2"
          >
            {label}
          </Text>
        </Float>
      )}
    </group>
  );
}

/* ─── Region Definitions ─── */
const BODY_REGIONS = [
  { name: 'head', label: 'Head', position: [0, 3.8, 0] as [number, number, number], size: 0.3 },
  { name: 'heart', label: 'Heart', position: [0.2, 2.5, 0.2] as [number, number, number], size: 0.22 },
  { name: 'lungs', label: 'Lungs', position: [-0.25, 2.4, 0.1] as [number, number, number], size: 0.28 },
  { name: 'chest', label: 'Chest', position: [0, 2.2, 0] as [number, number, number], size: 0.35 },
  { name: 'liver', label: 'Liver', position: [0.35, 1.3, 0.15] as [number, number, number], size: 0.2 },
  { name: 'stomach', label: 'Stomach', position: [-0.2, 1.2, 0.15] as [number, number, number], size: 0.18 },
  { name: 'kidneys', label: 'Kidneys', position: [0, 0.85, -0.1] as [number, number, number], size: 0.16 },
  { name: 'abdomen', label: 'Abdomen', position: [0, 1.0, 0] as [number, number, number], size: 0.32 },
  { name: 'left_arm', label: 'Left Arm', position: [-0.95, 1.8, 0] as [number, number, number], size: 0.14 },
  { name: 'right_arm', label: 'Right Arm', position: [0.95, 1.8, 0] as [number, number, number], size: 0.14 },
  { name: 'left_leg', label: 'Left Leg', position: [-0.28, -0.5, 0] as [number, number, number], size: 0.15 },
  { name: 'right_leg', label: 'Right Leg', position: [0.28, -0.5, 0] as [number, number, number], size: 0.15 },
  { name: 'spine', label: 'Spine', position: [0, 1.6, -0.25] as [number, number, number], size: 0.12 },
];

const ALL_REGION_NAMES = [...BODY_REGIONS.map(r => r.name), 'blood'];

/* ─── Main Component ─── */
export default function BodyVisualization() {
  const { regionHealthMap, metrics } = useHealthStore();
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  const selectedMetrics = selectedRegion
    ? metrics.filter(m => m.body_region === selectedRegion)
    : [];

  const metricsByName = new Map<string, typeof metrics>();
  for (const m of selectedMetrics) {
    const existing = metricsByName.get(m.metric_name) ?? [];
    existing.push(m);
    metricsByName.set(m.metric_name, existing);
  }

  const regionSummary = new Map<string, { total: number; flagged: number; status: RegionStatus }>();
  for (const region of ALL_REGION_NAMES) {
    const regionMetrics = metrics.filter(m => m.body_region === region);
    const flagged = regionMetrics.filter(m => m.status === 'critical' || m.status === 'high' || m.status === 'low').length;
    regionSummary.set(region, {
      total: regionMetrics.length,
      flagged,
      status: regionHealthMap[region] ?? 'nodata',
    });
  }

  return (
    <div className="body-view">
      <div className="body-canvas">
        <Canvas
          camera={{ position: [0, 1.5, 6], fov: 40 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          {/* Lighting */}
          <ambientLight intensity={0.3} />
          <directionalLight position={[5, 8, 5]} intensity={0.6} color="#e2e8f0" />
          <directionalLight position={[-3, 4, -3]} intensity={0.2} color="#22d3ee" />
          <pointLight position={[0, 2, 2]} intensity={0.4} color="#22d3ee" distance={8} />
          <pointLight position={[0, 0, -2]} intensity={0.15} color="#7c3aed" distance={6} />

          {/* Environment effects */}
          <fog attach="fog" args={['#060a14', 8, 18]} />
          <GridFloor />
          <Particles />
          <ScanLine />

          {/* Wireframe body shell */}
          <BodyShell />

          {/* Interactive organ regions */}
          {BODY_REGIONS.map(region => (
            <BodyRegion
              key={region.name}
              {...region}
              status={regionHealthMap[region.name] ?? 'nodata'}
              selected={selectedRegion === region.name}
              onSelect={setSelectedRegion}
            />
          ))}

          <OrbitControls
            enablePan={false}
            minDistance={3.5}
            maxDistance={10}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 1.2}
            autoRotate
            autoRotateSpeed={0.3}
          />
        </Canvas>
      </div>

      <div className="body-side-panel">
        {selectedRegion ? (
          <>
            <div className="body-region-panel-header">
              <h3>{BODY_REGIONS.find(r => r.name === selectedRegion)?.label ?? selectedRegion}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedRegion(null)}>Close</button>
            </div>

            <div className="body-region-status">
              <span className={`severity-dot severity-${regionHealthMap[selectedRegion] ?? 'nodata'}`} />
              <span>{(regionHealthMap[selectedRegion] ?? 'nodata').toUpperCase()}</span>
              <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)' }}>
                {selectedMetrics.length} metric{selectedMetrics.length !== 1 ? 's' : ''}
              </span>
            </div>

            {selectedMetrics.length === 0 ? (
              <p style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
                No health metrics for this region yet. Upload a medical report to populate data.
              </p>
            ) : (
              <div className="metric-list">
                {Array.from(metricsByName.entries()).map(([name, items]) => {
                  const latest = items[0];
                  const hasTrend = items.length > 1;
                  const prev = items[1];
                  const trendUp = hasTrend && latest.metric_value > prev.metric_value;
                  const trendDown = hasTrend && latest.metric_value < prev.metric_value;

                  return (
                    <div key={name} className="metric-item">
                      <div className="metric-name">{name}</div>
                      <div className="metric-value">
                        {latest.metric_value} {latest.metric_unit ?? ''}
                        {hasTrend && (
                          <span style={{ fontSize: 'var(--text-xs)', color: trendUp ? 'var(--color-error)' : trendDown ? 'var(--color-success)' : 'var(--color-tx-faint)', marginLeft: '0.25rem' }}>
                            {trendUp ? '\u2191' : trendDown ? '\u2193' : '\u2192'}
                          </span>
                        )}
                        <span className={`badge badge-${latest.status === 'normal' ? 'success' : latest.status === 'critical' ? 'error' : 'warning'}`}>
                          {latest.status}
                        </span>
                      </div>
                      {(latest.ref_range_low != null || latest.ref_range_high != null) && (
                        <div className="metric-range">
                          Ref: {latest.ref_range_low ?? '?'} \u2013 {latest.ref_range_high ?? '?'} {latest.metric_unit ?? ''}
                        </div>
                      )}
                      <div className="metric-range">{formatDate(latest.recorded_date)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <h3 style={{ marginBottom: '0.75rem', fontSize: 'var(--text-sm)', fontWeight: 600 }}>Region Summary</h3>
            <div className="region-summary-list">
              {Array.from(regionSummary.entries())
                .filter(([_, s]) => s.total > 0)
                .sort((a, b) => {
                  const order: Record<RegionStatus, number> = { critical: 0, warning: 1, normal: 2, nodata: 3 };
                  return order[a[1].status] - order[b[1].status];
                })
                .map(([region, summary]) => (
                  <button
                    key={region}
                    className="region-summary-item"
                    onClick={() => setSelectedRegion(region)}
                  >
                    <span className={`severity-dot severity-${summary.status}`} />
                    <span className="region-summary-name">{region.replace(/_/g, ' ')}</span>
                    <span className="region-summary-count">{summary.total} metrics</span>
                    {summary.flagged > 0 && (
                      <span className="badge badge-error" style={{ fontSize: '10px' }}>{summary.flagged} flagged</span>
                    )}
                  </button>
                ))}
              {Array.from(regionSummary.values()).every(s => s.total === 0) && (
                <p style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
                  No health data yet. Upload a report to map data to body regions.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="body-legend">
        {Object.entries(REGION_COLORS).map(([status, color]) => (
          <div key={status} className="body-legend-item">
            <span className="body-legend-dot" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
            <span>{status === 'nodata' ? 'No Data' : status.charAt(0).toUpperCase() + status.slice(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
