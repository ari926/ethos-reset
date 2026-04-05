import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useHealthStore, type RegionStatus } from '../../stores/healthStore';
import { formatDate } from '../../lib/utils';
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type LayerMode = 'skin' | 'muscles' | 'bones' | 'all' | 'xray';

/* ── Health region bounding boxes (normalized Y 0–1) ── */
const HEALTH_REGIONS: Record<string, { yMin: number; yMax: number }> = {
  head:      { yMin: 0.82, yMax: 1.0 },
  chest:     { yMin: 0.62, yMax: 0.82 },
  heart:     { yMin: 0.67, yMax: 0.78 },
  lungs:     { yMin: 0.65, yMax: 0.82 },
  abdomen:   { yMin: 0.45, yMax: 0.62 },
  liver:     { yMin: 0.50, yMax: 0.62 },
  stomach:   { yMin: 0.48, yMax: 0.58 },
  kidneys:   { yMin: 0.42, yMax: 0.52 },
  spine:     { yMin: 0.18, yMax: 0.82 },
  left_arm:  { yMin: 0.35, yMax: 0.78 },
  right_arm: { yMin: 0.35, yMax: 0.78 },
  left_leg:  { yMin: 0.0, yMax: 0.42 },
  right_leg: { yMin: 0.0, yMax: 0.42 },
};

const STATUS_EMISSIVE: Record<RegionStatus, { color: string; intensity: number }> = {
  normal:   { color: '#22c55e', intensity: 0.1 },
  warning:  { color: '#f59e0b', intensity: 0.3 },
  critical: { color: '#ef4444', intensity: 0.5 },
  nodata:   { color: '#000000', intensity: 0 },
};

/* ─── Skin material: smooth flesh tone over the whole body mesh ─── */
const SKIN_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color('#c4956a'),
  roughness: 0.65,
  metalness: 0.02,
  clearcoat: 0.15,
  clearcoatRoughness: 0.4,
  transparent: true,
  opacity: 1,
  side: THREE.DoubleSide,
  depthWrite: true,
});

/* ─── Grid Floor ─── */
function GridFloor() {
  return (
    <group position={[0, -1.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <gridHelper args={[20, 40, '#1a2744', '#0d1528']} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

/* ─── Anatomy Model ─── */
function AnatomyModel({
  layer, opacity, selectedPart, onSelectPart, healthRegions,
}: {
  layer: LayerMode;
  opacity: number;
  selectedPart: string | null;
  onSelectPart: (name: string | null) => void;
  healthRegions: Record<string, RegionStatus>;
}) {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const modelBounds = useRef({ min: 0, max: 1 });
  const originalMaterials = useRef(new Map<string, THREE.Material>());
  const { camera } = useThree();

  // Load model
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

      // Compute bounds after transform
      const transformedBox = new THREE.Box3().setFromObject(scene);
      modelBounds.current = { min: transformedBox.min.y, max: transformedBox.max.y };

      // Store original materials and tag meshes
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat) {
            mat.transparent = true;
            mat.side = THREE.DoubleSide;
            originalMaterials.current.set(mesh.uuid, mat.clone());
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

  // Apply layer, opacity, health highlighting
  useEffect(() => {
    if (!model) return;
    const { min: boundsMin, max: boundsMax } = modelBounds.current;
    const boundsHeight = boundsMax - boundsMin;

    model.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const origMat = originalMaterials.current.get(mesh.uuid);
      if (!origMat) return;

      const partName = mesh.userData.name || mesh.name;

      // Visibility & material based on layer
      if (layer === 'skin') {
        mesh.visible = true;
        // Apply skin material (clone per mesh for independent opacity)
        const skinMat = SKIN_MATERIAL.clone();
        skinMat.opacity = opacity;
        skinMat.depthWrite = opacity > 0.5;
        mesh.material = skinMat;
      } else if (layer === 'muscles') {
        mesh.visible = mesh.userData.isMuscle;
        mesh.material = (origMat as THREE.MeshStandardMaterial).clone();
      } else if (layer === 'bones') {
        mesh.visible = mesh.userData.isBone;
        mesh.material = (origMat as THREE.MeshStandardMaterial).clone();
      } else if (layer === 'xray') {
        mesh.visible = true;
        const xrayMat = (origMat as THREE.MeshStandardMaterial).clone();
        if (!mesh.userData.isBone && !mesh.userData.isMuscle) {
          xrayMat.opacity = 0.12;
          xrayMat.color = new THREE.Color('#4488cc');
          xrayMat.emissive = new THREE.Color('#1a3355');
          xrayMat.emissiveIntensity = 0.15;
        } else {
          xrayMat.opacity = 0.85;
        }
        xrayMat.transparent = true;
        xrayMat.depthWrite = false;
        mesh.material = xrayMat;
      } else {
        mesh.visible = true;
        mesh.material = (origMat as THREE.MeshStandardMaterial).clone();
      }

      if (!mesh.visible) return;

      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.transparent = true;

      // Apply opacity (unless skin/xray mode which already set it)
      if (layer !== 'skin' && layer !== 'xray') {
        mat.opacity = (selectedPart && partName === selectedPart) ? 1 : opacity;
        mat.depthWrite = mat.opacity > 0.6;
      }

      // Health highlighting based on mesh Y position
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);
      const normalizedY = boundsHeight > 0 ? (worldPos.y - boundsMin) / boundsHeight : 0.5;

      let healthGlow = STATUS_EMISSIVE.nodata;
      for (const [regionName, bounds] of Object.entries(HEALTH_REGIONS)) {
        if (normalizedY >= bounds.yMin && normalizedY <= bounds.yMax) {
          const status = healthRegions[regionName];
          if (status && status !== 'nodata') {
            healthGlow = STATUS_EMISSIVE[status];
            break;
          }
        }
      }

      mat.emissive = new THREE.Color(healthGlow.color);
      mat.emissiveIntensity = healthGlow.intensity;

      // Override with selection/hover highlight
      if (partName === selectedPart) {
        mat.emissive = new THREE.Color('#22d3ee');
        mat.emissiveIntensity = 0.4;
      } else if (partName === hovered) {
        mat.emissive = new THREE.Color('#22d3ee');
        mat.emissiveIntensity = 0.2;
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
    setHovered((e.object as THREE.Mesh).userData.name || (e.object as THREE.Mesh).name);
    document.body.style.cursor = 'pointer';
  }, []);

  const handlePointerOut = useCallback(() => {
    setHovered(null);
    document.body.style.cursor = 'auto';
  }, []);

  // Pulsing glow for critical/warning regions
  const pulseRef = useRef(0);
  useFrame((_, delta) => {
    pulseRef.current += delta * 2;
    if (!model) return;
    const { min: boundsMin, max: boundsMax } = modelBounds.current;
    const boundsHeight = boundsMax - boundsMin;

    model.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat || !mat.emissive) return;

      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);
      const normalizedY = boundsHeight > 0 ? (worldPos.y - boundsMin) / boundsHeight : 0.5;

      for (const [regionName, bounds] of Object.entries(HEALTH_REGIONS)) {
        if (normalizedY >= bounds.yMin && normalizedY <= bounds.yMax) {
          const status = healthRegions[regionName];
          if (status === 'critical') {
            mat.emissiveIntensity = 0.3 + Math.sin(pulseRef.current * 3) * 0.2;
          } else if (status === 'warning') {
            mat.emissiveIntensity = 0.2 + Math.sin(pulseRef.current * 2) * 0.1;
          }
          break;
        }
      }
    });
  });

  if (!model) return null;

  return (
    <primitive
      object={model}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    />
  );
}

/* ─── Layer Tab ─── */
function LayerTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.5rem 1.1rem',
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

/* ─── Region definitions ─── */
const ALL_REGION_NAMES = ['head', 'chest', 'heart', 'lungs', 'abdomen', 'liver', 'stomach', 'kidneys', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'spine', 'blood'];

/* ═══════ MAIN COMPONENT ═══════ */
export default function BodyVisualization() {
  const { regionHealthMap, metrics } = useHealthStore();
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [layer, setLayer] = useState<LayerMode>('skin');
  const [opacity, setOpacity] = useState(1);
  const [loading, setLoading] = useState(true);

  const selectedMetrics = selectedPart ? metrics.filter(m => m.body_region === selectedPart) : [];

  const metricsByName = useMemo(() => {
    const map = new Map<string, typeof metrics>();
    for (const m of selectedMetrics) {
      const arr = map.get(m.metric_name) ?? [];
      arr.push(m);
      map.set(m.metric_name, arr);
    }
    return map;
  }, [selectedMetrics]);

  const regionSummary = useMemo(() => {
    const map = new Map<string, { total: number; flagged: number; status: RegionStatus }>();
    for (const region of ALL_REGION_NAMES) {
      const rm = metrics.filter(m => m.body_region === region);
      const flagged = rm.filter(m => m.status === 'critical' || m.status === 'high' || m.status === 'low').length;
      map.set(region, { total: rm.length, flagged, status: regionHealthMap[region] ?? 'nodata' });
    }
    return map;
  }, [metrics, regionHealthMap]);

  // Inline CSS for pulse animation
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse-label {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(1.05); }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <div className="body-view">
      <div className="body-canvas">
        <Canvas
          camera={{ position: [0, 1.5, 5], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
          onCreated={() => setLoading(false)}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 8, 5]} intensity={0.9} color="#ffffff" />
          <directionalLight position={[-3, 4, -3]} intensity={0.35} color="#c0d0e0" />
          <directionalLight position={[0, -2, 3]} intensity={0.15} color="#ffd4a8" />
          <hemisphereLight args={['#b0c4de', '#1a1a2e', 0.35]} />
          <fog attach="fog" args={['#060a14', 10, 22]} />
          <GridFloor />

          <AnatomyModel
            layer={layer}
            opacity={opacity}
            selectedPart={selectedPart}
            onSelectPart={setSelectedPart}
            healthRegions={regionHealthMap}
          />

          <OrbitControls enablePan={true} minDistance={2} maxDistance={12} target={[0, 1, 0]} />
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

        {/* Floating metric labels */}
        {!loading && !selectedPart && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
            {Object.entries(regionHealthMap).filter(([, status]) => status === 'critical' || status === 'warning').map(([region, status]) => {
              const regionMetrics = metrics.filter(m => m.body_region === region && (m.status === 'critical' || m.status === 'high' || m.status === 'low'));
              if (regionMetrics.length === 0) return null;
              const topMetric = regionMetrics[0];
              const bounds = HEALTH_REGIONS[region];
              if (!bounds) return null;
              const yPercent = 100 - ((bounds.yMin + bounds.yMax) / 2) * 80 - 5;
              const xOffset = region.includes('left') ? '15%' : region.includes('right') ? '65%' : '60%';
              return (
                <div key={region} style={{
                  position: 'absolute',
                  top: `${yPercent}%`,
                  left: xOffset,
                  background: status === 'critical' ? 'rgba(239,68,68,0.9)' : 'rgba(245,158,11,0.9)',
                  color: '#fff',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  animation: status === 'critical' ? 'pulse-label 2s infinite' : undefined,
                }}>
                  {topMetric.metric_name}: {topMetric.metric_value} {topMetric.metric_unit ?? ''}
                </div>
              );
            })}
          </div>
        )}

        {/* Layer Tabs */}
        <div style={{
          position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: '0.35rem', padding: '0.35rem',
          background: 'rgba(17,24,39,0.85)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: 'var(--radius-full)',
        }}>
          <LayerTab label="Skin" active={layer === 'skin'} onClick={() => setLayer('skin')} />
          <LayerTab label="Muscles" active={layer === 'muscles'} onClick={() => setLayer('muscles')} />
          <LayerTab label="Bones" active={layer === 'bones'} onClick={() => setLayer('bones')} />
          <LayerTab label="All" active={layer === 'all'} onClick={() => setLayer('all')} />
          <LayerTab label="X-Ray" active={layer === 'xray'} onClick={() => setLayer('xray')} />
        </div>

        {/* Opacity Slider */}
        <div style={{
          position: 'absolute', bottom: '1rem', left: '1rem', right: '1rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem',
          background: 'rgba(17,24,39,0.85)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: 'var(--radius-md)',
        }}>
          <span style={{ fontSize: '11px', color: 'var(--color-tx-faint)', whiteSpace: 'nowrap' }}>Opacity</span>
          <input type="range" min={0.1} max={1} step={0.05} value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--color-primary)' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--color-tx-faint)', minWidth: '32px' }}>{Math.round(opacity * 100)}%</span>
        </div>

        {selectedPart && (
          <div style={{
            position: 'absolute', top: '1rem', right: '1rem', padding: '0.5rem 1rem',
            background: 'rgba(34,211,238,0.12)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(34,211,238,0.2)', borderRadius: 'var(--radius-md)',
            color: '#22d3ee', fontSize: '12px', fontWeight: 600,
          }}>
            {selectedPart.replace(/_/g, ' ')}
          </div>
        )}
      </div>

      {/* Side Panel */}
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
                        <span className={`badge badge-${latest.status === 'normal' ? 'success' : latest.status === 'critical' ? 'error' : 'warning'}`}>{latest.status}</span>
                      </div>
                      {(latest.ref_range_low != null || latest.ref_range_high != null) && (
                        <div className="metric-range">Ref: {latest.ref_range_low ?? '?'} – {latest.ref_range_high ?? '?'} {latest.metric_unit ?? ''}</div>
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
            <h3 style={{ marginBottom: '0.5rem', fontSize: 'var(--text-sm)', fontWeight: 600 }}>Body Explorer</h3>
            <p style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Switch layers to see Skin, Muscles, Bones, or All. Use the opacity slider to see through. Click any part for health details. Drag to rotate, scroll to zoom.
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
                  <button key={region} className="region-summary-item" onClick={() => setSelectedPart(region)}>
                    <span className={`severity-dot severity-${summary.status}`} />
                    <span className="region-summary-name">{region.replace(/_/g, ' ')}</span>
                    <span className="region-summary-count">{summary.total} metrics</span>
                    {summary.flagged > 0 && <span className="badge badge-error" style={{ fontSize: '10px' }}>{summary.flagged} flagged</span>}
                  </button>
                ))}
              {Array.from(regionSummary.values()).every(s => s.total === 0) && (
                <p style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
                  No health data yet. Upload a report to map data to body regions.
                </p>
              )}
            </div>
            <div style={{ marginTop: '1.5rem', padding: '0.75rem', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', color: 'var(--color-tx-faint)', lineHeight: 1.5 }}>
              Anatomy: Z-Anatomy (CC BY-SA 4.0)
            </div>
          </>
        )}
      </div>
    </div>
  );
}
