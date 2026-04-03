import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useHealthStore, type RegionStatus } from '../../stores/healthStore';
import { formatDate } from '../../lib/utils';
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type LayerMode = 'skin' | 'muscles' | 'bones' | 'all';

/* ── Health region bounding boxes (Y ranges in model space, 0–1.7) ── */
const HEALTH_REGIONS: Record<string, { yMin: number; yMax: number; label: string }> = {
  head:      { yMin: 1.4, yMax: 1.75, label: 'Head' },
  chest:     { yMin: 1.05, yMax: 1.4, label: 'Chest' },
  heart:     { yMin: 1.15, yMax: 1.35, label: 'Heart' },
  lungs:     { yMin: 1.1, yMax: 1.4, label: 'Lungs' },
  abdomen:   { yMin: 0.75, yMax: 1.05, label: 'Abdomen' },
  liver:     { yMin: 0.85, yMax: 1.05, label: 'Liver' },
  stomach:   { yMin: 0.8, yMax: 1.0, label: 'Stomach' },
  kidneys:   { yMin: 0.7, yMax: 0.9, label: 'Kidneys' },
  spine:     { yMin: 0.3, yMax: 1.4, label: 'Spine' },
  left_arm:  { yMin: 0.7, yMax: 1.4, label: 'Left Arm' },
  right_arm: { yMin: 0.7, yMax: 1.4, label: 'Right Arm' },
  left_leg:  { yMin: 0.0, yMax: 0.7, label: 'Left Leg' },
  right_leg: { yMin: 0.0, yMax: 0.7, label: 'Right Leg' },
};

const STATUS_COLORS: Record<RegionStatus, THREE.Color> = {
  normal: new THREE.Color('#22c55e'),
  warning: new THREE.Color('#f59e0b'),
  critical: new THREE.Color('#ef4444'),
  nodata: new THREE.Color('#4b5563'),
};

/* ─── Procedural Human Skin Shell ─── */
function SkinShell({ visible, opacity }: { visible: boolean; opacity: number }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      // Subtle breathing animation
      const breathe = 1 + Math.sin(clock.elapsedTime * 0.8) * 0.003;
      groupRef.current.scale.set(breathe, 1, breathe);
    }
  });

  if (!visible) return null;

  const skinColor = '#d4a574';
  const mat = { color: skinColor, transparent: true, opacity, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide as THREE.Side, depthWrite: opacity > 0.5 };

  return (
    <group ref={groupRef} position={[0, 0.85, 0]}>
      {/* Head */}
      <mesh position={[0, 0.72, 0.01]}>
        <sphereGeometry args={[0.1, 32, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* Neck */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.045, 0.05, 0.08, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* Upper torso */}
      <mesh position={[0, 0.42, 0]}>
        <capsuleGeometry args={[0.14, 0.2, 16, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* Lower torso / hips */}
      <mesh position={[0, 0.15, 0]}>
        <capsuleGeometry args={[0.12, 0.18, 16, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* Left upper arm */}
      <mesh position={[-0.2, 0.42, 0]} rotation={[0, 0, 0.15]}>
        <capsuleGeometry args={[0.04, 0.18, 8, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* Left forearm */}
      <mesh position={[-0.25, 0.22, 0]} rotation={[0, 0, 0.08]}>
        <capsuleGeometry args={[0.032, 0.16, 8, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* Right upper arm */}
      <mesh position={[0.2, 0.42, 0]} rotation={[0, 0, -0.15]}>
        <capsuleGeometry args={[0.04, 0.18, 8, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* Right forearm */}
      <mesh position={[0.25, 0.22, 0]} rotation={[0, 0, -0.08]}>
        <capsuleGeometry args={[0.032, 0.16, 8, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* Left thigh */}
      <mesh position={[-0.065, -0.1, 0]}>
        <capsuleGeometry args={[0.055, 0.22, 8, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* Left shin */}
      <mesh position={[-0.065, -0.42, 0]}>
        <capsuleGeometry args={[0.04, 0.24, 8, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* Right thigh */}
      <mesh position={[0.065, -0.1, 0]}>
        <capsuleGeometry args={[0.055, 0.22, 8, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* Right shin */}
      <mesh position={[0.065, -0.42, 0]}>
        <capsuleGeometry args={[0.04, 0.24, 8, 16]} />
        <meshStandardMaterial {...mat} />
      </mesh>
    </group>
  );
}

/* ─── Anatomy Model Loader ─── */
function AnatomyModel({
  layer,
  opacity,
  selectedPart,
  onSelectPart,
  healthRegions,
}: {
  layer: LayerMode;
  opacity: number;
  selectedPart: string | null;
  onSelectPart: (name: string | null) => void;
  healthRegions: Record<string, RegionStatus>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const { camera } = useThree();

  useEffect(() => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    loader.load('/body.glb', (gltf) => {
      const scene = gltf.scene;
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 4 / maxDim;

      scene.scale.setScalar(scale);
      scene.position.set(-center.x * scale, -center.y * scale + 0.5, -center.z * scale);

      // Setup all mesh materials
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat) {
            mat.transparent = true;
            mat.opacity = 1;
            mat.side = THREE.DoubleSide;
            mat.depthWrite = true;
            mesh.userData.originalColor = mat.color.clone();
            mesh.userData.isBone = mat.name === 'Mat_Bone_Pro';
            mesh.userData.isMuscle = mat.name === 'Mat_Muscle_Pro';
          }
        }
      });

      setModel(scene);
      camera.position.set(0, 1.5, 5);
    });

    return () => { dracoLoader.dispose(); };
  }, [camera]);

  // Update layer visibility & health highlighting
  useEffect(() => {
    if (!model) return;
    model.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;

      // Visibility based on layer
      if (layer === 'skin') {
        mesh.visible = false; // Anatomy hidden when skin is showing
      } else if (layer === 'muscles') {
        mesh.visible = mesh.userData.isMuscle;
      } else if (layer === 'bones') {
        mesh.visible = mesh.userData.isBone;
      } else {
        mesh.visible = true;
      }

      // Opacity
      mat.opacity = (selectedPart && (mesh.name === selectedPart || mesh.userData.name === selectedPart)) ? 1 : opacity;
      mat.depthWrite = mat.opacity > 0.6;

      // Health highlighting: find which region this mesh belongs to
      if (mesh.visible && mesh.userData.originalColor) {
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        // Normalize Y to model height (~0 to ~1.7 scaled)
        const normalizedY = (worldPos.y + 1.5) / 4; // rough mapping

        let regionStatus: RegionStatus = 'nodata';
        for (const [regionName, regionDef] of Object.entries(HEALTH_REGIONS)) {
          if (normalizedY >= regionDef.yMin && normalizedY <= regionDef.yMax) {
            const status = healthRegions[regionName];
            if (status && status !== 'nodata') {
              regionStatus = status;
              break;
            }
          }
        }

        // Apply health color as emissive glow
        if (regionStatus !== 'nodata') {
          mat.emissive = STATUS_COLORS[regionStatus];
          mat.emissiveIntensity = regionStatus === 'critical' ? 0.4 : regionStatus === 'warning' ? 0.25 : 0.1;
        } else {
          mat.emissive.set('#000000');
          mat.emissiveIntensity = 0;
        }
      }

      // Hover/select highlight
      const partName = mesh.userData.name || mesh.name;
      if (partName === selectedPart) {
        mat.emissive = new THREE.Color('#22d3ee');
        mat.emissiveIntensity = 0.35;
      } else if (partName === hovered) {
        mat.emissive = new THREE.Color('#22d3ee');
        mat.emissiveIntensity = 0.15;
      }
    });
  }, [model, layer, opacity, selectedPart, hovered, healthRegions]);

  const handleClick = useCallback((e: { object?: THREE.Object3D; stopPropagation?: () => void }) => {
    if (!e.object) return;
    e.stopPropagation?.();
    const mesh = e.object as THREE.Mesh;
    const name = mesh.userData.name || mesh.name || null;
    onSelectPart(name === selectedPart ? null : name);
  }, [selectedPart, onSelectPart]);

  const handlePointerOver = useCallback((e: { object?: THREE.Object3D; stopPropagation?: () => void }) => {
    if (!e.object) return;
    e.stopPropagation?.();
    const mesh = e.object as THREE.Mesh;
    setHovered(mesh.userData.name || mesh.name);
    document.body.style.cursor = 'pointer';
  }, []);

  const handlePointerOut = useCallback(() => {
    setHovered(null);
    document.body.style.cursor = 'auto';
  }, []);

  if (!model) return null;

  return (
    <group ref={groupRef}>
      <primitive
        object={model}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      />
    </group>
  );
}

/* ─── Grid Floor ─── */
function GridFloor() {
  return (
    <group position={[0, -1.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <gridHelper args={[20, 40, '#1a2744', '#0d1528']} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

/* ─── Region definitions for health data ─── */
const ALL_REGION_NAMES = ['head', 'chest', 'heart', 'lungs', 'abdomen', 'liver', 'stomach', 'kidneys', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'spine', 'blood'];

/* ─── Layer Tab Button ─── */
function LayerTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.45rem 1rem',
        fontSize: '12px',
        fontWeight: active ? 600 : 500,
        background: active ? 'var(--color-primary)' : 'rgba(255,255,255,0.04)',
        color: active ? 'white' : 'var(--color-tx-muted)',
        border: `1px solid ${active ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 'var(--radius-full)',
        cursor: 'pointer',
        transition: 'all 200ms ease',
        whiteSpace: 'nowrap' as const,
      }}
    >
      {label}
    </button>
  );
}

/* ═══════ MAIN COMPONENT ═══════ */
export default function BodyVisualization() {
  const { regionHealthMap, metrics } = useHealthStore();
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [layer, setLayer] = useState<LayerMode>('skin');
  const [opacity, setOpacity] = useState(1);
  const [loading, setLoading] = useState(true);

  const selectedMetrics = selectedPart
    ? metrics.filter(m => m.body_region === selectedPart)
    : [];

  const metricsByName = useMemo(() => {
    const map = new Map<string, typeof metrics>();
    for (const m of selectedMetrics) {
      const existing = map.get(m.metric_name) ?? [];
      existing.push(m);
      map.set(m.metric_name, existing);
    }
    return map;
  }, [selectedMetrics]);

  const regionSummary = useMemo(() => {
    const map = new Map<string, { total: number; flagged: number; status: RegionStatus }>();
    for (const region of ALL_REGION_NAMES) {
      const regionMetrics = metrics.filter(m => m.body_region === region);
      const flagged = regionMetrics.filter(m => m.status === 'critical' || m.status === 'high' || m.status === 'low').length;
      map.set(region, {
        total: regionMetrics.length,
        flagged,
        status: regionHealthMap[region] ?? 'nodata',
      });
    }
    return map;
  }, [metrics, regionHealthMap]);

  return (
    <div className="body-view">
      <div className="body-canvas">
        <Canvas
          camera={{ position: [0, 1.5, 5], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
          onCreated={() => setLoading(false)}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} color="#ffffff" />
          <directionalLight position={[-3, 4, -3]} intensity={0.4} color="#c0d0e0" />
          <hemisphereLight args={['#b0c4de', '#1a1a2e', 0.3]} />
          <fog attach="fog" args={['#060a14', 10, 22]} />
          <GridFloor />

          {/* Procedural skin shell */}
          <SkinShell visible={layer === 'skin'} opacity={opacity} />

          {/* Real anatomy model */}
          <AnatomyModel
            layer={layer}
            opacity={opacity}
            selectedPart={selectedPart}
            onSelectPart={setSelectedPart}
            healthRegions={regionHealthMap}
          />

          <OrbitControls
            enablePan={true}
            minDistance={2}
            maxDistance={12}
            target={[0, 1, 0]}
          />
        </Canvas>

        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(6,10,20,0.9)', color: 'var(--color-tx-muted)', fontSize: 'var(--text-sm)',
            borderRadius: 'var(--radius-xl)',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div className="spinning" style={{ width: 32, height: 32, border: '2px solid var(--color-divider)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', margin: '0 auto 0.75rem' }} />
              Loading 3D anatomy...
            </div>
          </div>
        )}

        {/* Layer Tabs */}
        <div style={{
          position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: '0.35rem',
          padding: '0.35rem',
          background: 'rgba(17,24,39,0.8)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: 'var(--radius-full)',
        }}>
          <LayerTab label="🧑 Skin" active={layer === 'skin'} onClick={() => setLayer('skin')} />
          <LayerTab label="💪 Muscles" active={layer === 'muscles'} onClick={() => setLayer('muscles')} />
          <LayerTab label="🦴 Bones" active={layer === 'bones'} onClick={() => setLayer('bones')} />
          <LayerTab label="🔬 All" active={layer === 'all'} onClick={() => setLayer('all')} />
        </div>

        {/* Opacity Slider */}
        <div style={{
          position: 'absolute', bottom: '1rem', left: '1rem', right: '1rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.6rem 1rem',
          background: 'rgba(17,24,39,0.8)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: 'var(--radius-md)',
        }}>
          <span style={{ fontSize: '11px', color: 'var(--color-tx-faint)', whiteSpace: 'nowrap' }}>Opacity</span>
          <input
            type="range" min={0.1} max={1} step={0.05} value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--color-primary)' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--color-tx-faint)', minWidth: '32px' }}>
            {Math.round(opacity * 100)}%
          </span>
        </div>

        {/* Selected part label */}
        {selectedPart && (
          <div style={{
            position: 'absolute', top: '1rem', right: '1rem',
            padding: '0.5rem 1rem',
            background: 'rgba(34,211,238,0.12)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(34,211,238,0.2)', borderRadius: 'var(--radius-md)',
            color: '#22d3ee', fontSize: '12px', fontWeight: 600,
          }}>
            {selectedPart.replace(/_/g, ' ')}
          </div>
        )}
      </div>

      {/* ─── Side Panel ─── */}
      <div className="body-side-panel">
        {selectedPart ? (
          <>
            <div className="body-region-panel-header">
              <h3>{selectedPart.replace(/_/g, ' ')}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedPart(null)}>Close</button>
            </div>

            <div className="body-region-status">
              <span className={`severity-dot severity-${regionHealthMap[selectedPart] ?? 'nodata'}`} />
              <span>{(regionHealthMap[selectedPart] ?? 'no data').toUpperCase()}</span>
              <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)' }}>
                {selectedMetrics.length} metric{selectedMetrics.length !== 1 ? 's' : ''}
              </span>
            </div>

            {selectedMetrics.length === 0 ? (
              <p style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
                No health metrics mapped to this part yet. Upload a medical report to populate data.
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
                            {trendUp ? '↑' : trendDown ? '↓' : '→'}
                          </span>
                        )}
                        <span className={`badge badge-${latest.status === 'normal' ? 'success' : latest.status === 'critical' ? 'error' : 'warning'}`}>
                          {latest.status}
                        </span>
                      </div>
                      {(latest.ref_range_low != null || latest.ref_range_high != null) && (
                        <div className="metric-range">
                          Ref: {latest.ref_range_low ?? '?'} – {latest.ref_range_high ?? '?'} {latest.metric_unit ?? ''}
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
            <h3 style={{ marginBottom: '0.5rem', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
              Body Layers
            </h3>
            <p style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Switch between Skin, Muscles, Bones, and full view. Rotate to explore. Click any part for details. Regions glow based on health status.
            </p>

            <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-tx-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
              Health Regions
            </h4>
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
                    onClick={() => setSelectedPart(region)}
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

            <div style={{ marginTop: '1.5rem', padding: '0.75rem', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)', lineHeight: 1.5 }}>
              Anatomy model: Z-Anatomy (CC BY-SA 4.0)
            </div>
          </>
        )}
      </div>
    </div>
  );
}
