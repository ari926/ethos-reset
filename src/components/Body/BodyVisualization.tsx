import { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useHealthStore, type RegionStatus } from '../../stores/healthStore';
import { formatDate } from '../../lib/utils';
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/* ─── Anatomy Model Loader ─── */
function AnatomyModel({
  opacity,
  showMuscles,
  showBones,
  showOrgans,
  selectedPart,
  onSelectPart,
}: {
  opacity: number;
  showMuscles: boolean;
  showBones: boolean;
  showOrgans: boolean;
  selectedPart: string | null;
  onSelectPart: (name: string | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const { camera } = useThree();

  // Load GLB with DRACO
  useEffect(() => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    loader.load('/body.glb', (gltf) => {
      const scene = gltf.scene;

      // Center and scale the model
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 4 / maxDim;

      scene.scale.setScalar(scale);
      scene.position.set(-center.x * scale, -center.y * scale + 0.5, -center.z * scale);

      // Setup materials
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.material) {
            const mat = (mesh.material as THREE.MeshStandardMaterial);
            mat.transparent = true;
            mat.opacity = 1;
            mat.side = THREE.DoubleSide;
            mat.depthWrite = true;
            // Store original color
            if (mat.color) {
              mesh.userData.originalColor = mat.color.clone();
            }
          }
        }
      });

      setModel(scene);

      // Position camera to see full body
      camera.position.set(0, 1.5, 5);
      (camera as THREE.PerspectiveCamera).lookAt(0, 1, 0);
    });

    return () => { dracoLoader.dispose(); };
  }, [camera]);

  // Update visibility based on layer toggles
  useEffect(() => {
    if (!model) return;
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const type = (mesh.userData.type || '').toLowerCase();
        let visible = true;

        if (type.includes('muscle') || type.includes('musc')) visible = showMuscles;
        else if (type.includes('bone') || type.includes('skel')) visible = showBones;
        else if (type.includes('organ') || type.includes('visc')) visible = showOrgans;

        mesh.visible = visible;
      }
    });
  }, [model, showMuscles, showBones, showOrgans]);

  // Update opacity
  useEffect(() => {
    if (!model) return;
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat) {
          const isSelected = selectedPart && (mesh.userData.name === selectedPart || mesh.name === selectedPart);
          mat.opacity = isSelected ? 1 : opacity;
          mat.depthWrite = opacity > 0.8;
        }
      }
    });
  }, [model, opacity, selectedPart]);

  // Highlight selected/hovered part
  useEffect(() => {
    if (!model) return;
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const partName = mesh.userData.name || mesh.name;

        if (partName === selectedPart) {
          mat.emissive = new THREE.Color('#22d3ee');
          mat.emissiveIntensity = 0.3;
        } else if (partName === hovered) {
          mat.emissive = new THREE.Color('#22d3ee');
          mat.emissiveIntensity = 0.15;
        } else {
          mat.emissive = new THREE.Color('#000000');
          mat.emissiveIntensity = 0;
        }
      }
    });
  }, [model, selectedPart, hovered]);

  const handleClick = useCallback((e: { object?: THREE.Object3D; stopPropagation?: () => void }) => {
    if (!e.object) return;
    e.stopPropagation?.();
    const mesh = e.object as THREE.Mesh;
    const name = mesh.userData.name || mesh.name || null;
    if (name === selectedPart) {
      onSelectPart(null);
    } else {
      onSelectPart(name);
    }
  }, [selectedPart, onSelectPart]);

  const handlePointerOver = useCallback((e: { object?: THREE.Object3D; stopPropagation?: () => void }) => {
    if (!e.object) return;
    e.stopPropagation?.();
    const mesh = e.object as THREE.Mesh;
    const name = mesh.userData.name || mesh.name;
    setHovered(name);
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
    <group position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <gridHelper args={[20, 40, '#1a2744', '#0d1528']} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

/* ─── Main Region Definitions (for mapping to health data) ─── */
const ALL_REGION_NAMES = ['head', 'chest', 'heart', 'lungs', 'abdomen', 'liver', 'stomach', 'kidneys', 'left_arm', 'right_arm', 'left_leg', 'right_leg', 'spine', 'blood'];

/* ─── Main Component ─── */
export default function BodyVisualization() {
  const { regionHealthMap, metrics } = useHealthStore();
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(1);
  const [showMuscles, setShowMuscles] = useState(true);
  const [showBones, setShowBones] = useState(true);
  const [showOrgans, setShowOrgans] = useState(true);
  const [loading, setLoading] = useState(true);

  // Map selected part name to our health region
  const selectedRegion = selectedPart; // Could add mapping logic here

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
          camera={{ position: [0, 1.5, 5], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
          onCreated={() => setLoading(false)}
        >
          {/* Lighting */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} color="#ffffff" />
          <directionalLight position={[-3, 4, -3]} intensity={0.4} color="#c0d0e0" />
          <hemisphereLight args={['#b0c4de', '#1a1a2e', 0.3]} />

          <fog attach="fog" args={['#060a14', 10, 22]} />
          <GridFloor />

          <AnatomyModel
            opacity={opacity}
            showMuscles={showMuscles}
            showBones={showBones}
            showOrgans={showOrgans}
            selectedPart={selectedPart}
            onSelectPart={setSelectedPart}
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
              Loading 3D anatomy model...
            </div>
          </div>
        )}

        {/* Layer Controls */}
        <div style={{
          position: 'absolute', top: '1rem', left: '1rem',
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
        }}>
          <button
            className={`btn btn-sm ${showMuscles ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setShowMuscles(!showMuscles)}
            style={{ fontSize: '11px' }}
          >
            Muscles
          </button>
          <button
            className={`btn btn-sm ${showBones ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setShowBones(!showBones)}
            style={{ fontSize: '11px' }}
          >
            Bones
          </button>
          <button
            className={`btn btn-sm ${showOrgans ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setShowOrgans(!showOrgans)}
            style={{ fontSize: '11px' }}
          >
            Organs
          </button>
        </div>

        {/* Opacity Slider */}
        <div style={{
          position: 'absolute', bottom: '1rem', left: '1rem', right: '1rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.6rem 1rem',
          background: 'rgba(17,24,39,0.75)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: 'var(--radius-md)',
        }}>
          <span style={{ fontSize: '11px', color: 'var(--color-tx-faint)', whiteSpace: 'nowrap' }}>Opacity</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={opacity}
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
            <h3 style={{ marginBottom: '1rem', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
              Interact with the 3D model
            </h3>
            <p style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              Click on any body part to select it. Use the opacity slider to see through layers. Toggle muscle, bone, and organ visibility with the buttons.
            </p>

            <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-tx-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
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
              3D model: Z-Anatomy (CC BY-SA 4.0)
            </div>
          </>
        )}
      </div>
    </div>
  );
}
