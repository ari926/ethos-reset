import { useState, useEffect, useMemo } from 'react';
import { useHealthStore, type Restriction, type HealthMetric } from '../stores/healthStore';
import { ShieldAlert, Plus, Trash2, Edit2, Utensils, Dna, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import RestrictionModal from '../components/Restrictions/RestrictionModal';
import ConfirmDialog from '../components/common/ConfirmDialog';

const QUICK_ADD_PRESETS = [
  'Peanuts', 'Tree Nuts', 'Shellfish', 'Dairy', 'Gluten', 'Eggs', 'Soy',
  'Penicillin', 'Aspirin', 'NSAIDs', 'Sulfa Drugs', 'Latex',
];

type RestrictionsTab = 'manual' | 'food' | 'genetics';

/* ── Food Sensitivity helpers ── */
interface FoodSensitivity {
  food: string;
  value: number;
  unit: string | null;
  level: 'High' | 'Moderate' | 'Low' | 'None';
  date: string;
}

function classifyFoodReaction(value: number, _unit: string | null): 'High' | 'Moderate' | 'Low' | 'None' {
  // P88 Dietary Antigen Test - IgG values in U/mL
  // Typical reference ranges: <10 Normal, 10-15 Low, 15-25 Moderate, >25 High
  if (value >= 25) return 'High';
  if (value >= 15) return 'Moderate';
  if (value >= 10) return 'Low';
  return 'None';
}

const FOOD_LEVEL_CONFIG = {
  High: { color: 'var(--color-error)', bg: 'var(--color-error-bg, rgba(239,68,68,0.1))', icon: '🔴', badge: 'error' },
  Moderate: { color: 'var(--color-warning)', bg: 'var(--color-warning-bg, rgba(245,158,11,0.1))', icon: '🟡', badge: 'warning' },
  Low: { color: 'var(--color-info, #3b82f6)', bg: 'var(--color-info-bg, rgba(59,130,246,0.1))', icon: '🔵', badge: 'primary' },
  None: { color: 'var(--color-success)', bg: 'var(--color-success-bg, rgba(34,197,94,0.1))', icon: '🟢', badge: 'success' },
};

/* ── Genetics helpers ── */
interface GeneticInsight {
  gene: string;
  variant: string;
  value: number;
  category: string;
  impact: string;
  date: string;
}

const GENE_CATEGORIES: Record<string, { label: string; icon: string; description: string }> = {
  medication: { label: 'Medication Response', icon: '💊', description: 'How your body processes common medications' },
  nutrient: { label: 'Nutrient Needs', icon: '🥬', description: 'Vitamins and minerals your genes say you need more of' },
  detox: { label: 'Detoxification', icon: '🧹', description: 'How well your body clears toxins and waste products' },
  methylation: { label: 'Methylation & DNA Repair', icon: '🧬', description: 'Genes that affect how your body repairs DNA and processes B vitamins' },
  inflammation: { label: 'Inflammation Risk', icon: '🔥', description: 'Genetic tendencies toward inflammation' },
  cardiovascular: { label: 'Heart & Cardiovascular', icon: '❤️', description: 'Genes that influence heart disease and cholesterol metabolism' },
  metabolism: { label: 'Metabolism & Weight', icon: '⚡', description: 'How your body handles fats, carbs, and energy' },
  other: { label: 'Other Genetic Markers', icon: '🔬', description: 'Additional genetic findings' },
};

function classifyGeneCategory(name: string): string {
  const n = name.toLowerCase();
  if (/cyp|nat2|ugt|sult|gst|nqo1|dpyd|slco|abcb|vkorc/i.test(n)) return 'medication';
  if (/mthfr|mtr|mtrr|comt|bhmt|cbs|shmt/i.test(n)) return 'methylation';
  if (/sod|gpx|cat|nrf2|hmox|nfe2l2/i.test(n)) return 'detox';
  if (/tnf|il-|il1|il6|nfkb|cox|lox/i.test(n)) return 'inflammation';
  if (/apoe|apob|lpa|pcsk9|cetp|lpl|mthfr.*cardio|ace|agt|nos3/i.test(n)) return 'cardiovascular';
  if (/fto|mc4r|pparg|adrb|tcf7l2|adipoq|lepr/i.test(n)) return 'metabolism';
  if (/vdr|bcmo1|fads|slc|mao|dao|hnmt/i.test(n)) return 'nutrient';
  return 'other';
}

/* ── Food Sensitivity Tab ── */
function FoodSensitivityTab({ memberId }: { memberId: string | null }) {
  const [foodData, setFoodData] = useState<FoodSensitivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set(['High', 'Moderate', 'Low']));

  useEffect(() => {
    if (!memberId) return;
    setLoading(true);
    // Query metrics that look like P88 / food sensitivity data
    // These typically have body_region = null or 'immune', source = 'report',
    // and metric_name is a food name, with status like 'high', 'low', 'normal'
    supabase
      .from('health_metrics')
      .select('*')
      .eq('member_id', memberId)
      .or('source.ilike.%p88%,source.ilike.%antigen%,source.ilike.%food%,metric_unit.ilike.%U/mL%,body_region.eq.immune')
      .order('metric_value', { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const foods: FoodSensitivity[] = data.map((m: HealthMetric) => ({
            food: m.metric_name,
            value: Number(m.metric_value),
            unit: m.metric_unit,
            level: classifyFoodReaction(Number(m.metric_value), m.metric_unit),
            date: m.recorded_date,
          }));
          setFoodData(foods);
        }
        setLoading(false);
      });
  }, [memberId]);

  const grouped = useMemo(() => {
    const groups: Record<string, FoodSensitivity[]> = { High: [], Moderate: [], Low: [], None: [] };
    for (const f of foodData) {
      groups[f.level].push(f);
    }
    // Sort each group by value descending
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => b.value - a.value);
    }
    return groups;
  }, [foodData]);

  const toggleLevel = (level: string) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  if (!memberId) {
    return (
      <div className="empty-state">
        <Utensils size={48} />
        <h2>Select a family member</h2>
        <p>Choose a family member to view their food sensitivity results.</p>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-tx-muted)' }}>Loading food sensitivity data...</div>;
  }

  if (foodData.length === 0) {
    return (
      <div className="empty-state">
        <Utensils size={48} />
        <h2>No food sensitivity data</h2>
        <p>Upload P88 Dietary Antigen Test results in the Reports tab. The AI will extract food sensitivity markers automatically.</p>
      </div>
    );
  }

  const highCount = grouped.High.length;
  const modCount = grouped.Moderate.length;

  return (
    <div>
      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap',
      }}>
        <div className="kpi-card" style={{ flex: 1, minWidth: '140px' }}>
          <div className="kpi-label">Total Foods Tested</div>
          <div className="kpi-value">{foodData.length}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, minWidth: '140px', borderLeft: '3px solid var(--color-error)' }}>
          <div className="kpi-label">High Reactivity</div>
          <div className="kpi-value" style={{ color: 'var(--color-error)' }}>{highCount}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, minWidth: '140px', borderLeft: '3px solid var(--color-warning)' }}>
          <div className="kpi-label">Moderate Reactivity</div>
          <div className="kpi-value" style={{ color: 'var(--color-warning)' }}>{modCount}</div>
        </div>
      </div>

      <div style={{
        background: 'var(--color-surface-offset)',
        borderRadius: 'var(--radius-md)',
        padding: '0.75rem 1rem',
        marginBottom: '1.5rem',
        fontSize: 'var(--text-sm)',
        lineHeight: 1.6,
        color: 'var(--color-tx-muted)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
      }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>
          These results come from the P88 Dietary Antigen Test, which measures your immune system's IgG response to specific foods.
          A high reaction does not necessarily mean you are allergic — it indicates your immune system is reacting to that food,
          which may cause inflammation. Consider an elimination diet for high-reactivity foods and discuss results with your doctor.
        </span>
      </div>

      {/* Grouped food lists */}
      {(['High', 'Moderate', 'Low', 'None'] as const).map(level => {
        const foods = grouped[level];
        if (foods.length === 0) return null;
        const config = FOOD_LEVEL_CONFIG[level];
        const isExpanded = expandedLevels.has(level);

        return (
          <div key={level} style={{ marginBottom: '1rem' }}>
            <button
              onClick={() => toggleLevel(level)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.75rem 1rem',
                background: config.bg,
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-tx)',
                textAlign: 'left',
              }}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>{config.icon}</span>
              <span>{level} Reactivity</span>
              <span className={`badge badge-${config.badge}`} style={{ marginLeft: 'auto' }}>
                {foods.length} food{foods.length !== 1 ? 's' : ''}
              </span>
            </button>
            {isExpanded && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '0.5rem',
                padding: '0.75rem 0.5rem',
              }}>
                {foods.map(f => (
                  <div
                    key={f.food}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem 0.75rem',
                      background: 'var(--color-surface)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-divider)',
                      fontSize: 'var(--text-sm)',
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{f.food}</span>
                    <span style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-xs)' }}>
                      {f.value} {f.unit ?? 'U/mL'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Genetics Tab ── */
function GeneticsTab({ memberId }: { memberId: string | null }) {
  const [geneData, setGeneData] = useState<GeneticInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['medication', 'methylation', 'nutrient']));

  useEffect(() => {
    if (!memberId) return;
    setLoading(true);
    // Query metrics from genetic/pharmacogenomic reports
    // These typically have source containing '3x4', 'genetic', 'pharmacogenom'
    // or body_region = 'genetic'
    supabase
      .from('health_metrics')
      .select('*')
      .eq('member_id', memberId)
      .or('source.ilike.%3x4%,source.ilike.%genetic%,source.ilike.%pharmaco%,body_region.eq.genetic')
      .order('metric_name', { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const insights: GeneticInsight[] = data.map((m: HealthMetric) => ({
            gene: m.metric_name,
            variant: m.metric_unit ?? '',
            value: Number(m.metric_value),
            category: classifyGeneCategory(m.metric_name),
            impact: m.status ?? 'normal',
            date: m.recorded_date,
          }));
          setGeneData(insights);
        }
        setLoading(false);
      });
  }, [memberId]);

  const grouped = useMemo(() => {
    const groups: Record<string, GeneticInsight[]> = {};
    for (const g of geneData) {
      if (!groups[g.category]) groups[g.category] = [];
      groups[g.category].push(g);
    }
    return groups;
  }, [geneData]);

  const toggleCat = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (!memberId) {
    return (
      <div className="empty-state">
        <Dna size={48} />
        <h2>Select a family member</h2>
        <p>Choose a family member to view their genetic insights.</p>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-tx-muted)' }}>Loading genetic data...</div>;
  }

  if (geneData.length === 0) {
    return (
      <div className="empty-state">
        <Dna size={48} />
        <h2>No genetic data</h2>
        <p>Upload 3x4 Genetics or pharmacogenomics test results in the Reports tab. The AI will extract gene variants and actionable insights automatically.</p>
      </div>
    );
  }

  const impactful = geneData.filter(g => g.impact === 'high' || g.impact === 'critical').length;

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="kpi-card" style={{ flex: 1, minWidth: '140px' }}>
          <div className="kpi-label">Gene Variants Analyzed</div>
          <div className="kpi-value">{geneData.length}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, minWidth: '140px' }}>
          <div className="kpi-label">Categories</div>
          <div className="kpi-value">{Object.keys(grouped).length}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, minWidth: '140px', borderLeft: '3px solid var(--color-warning)' }}>
          <div className="kpi-label">Notable Variants</div>
          <div className="kpi-value" style={{ color: 'var(--color-warning)' }}>{impactful}</div>
        </div>
      </div>

      <div style={{
        background: 'var(--color-surface-offset)',
        borderRadius: 'var(--radius-md)',
        padding: '0.75rem 1rem',
        marginBottom: '1.5rem',
        fontSize: 'var(--text-sm)',
        lineHeight: 1.6,
        color: 'var(--color-tx-muted)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
      }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>
          These results come from pharmacogenomic and genetic testing (e.g. 3x4 Genetics).
          Gene variants affect how your body processes medications, nutrients, and toxins.
          Having a variant does not mean you will develop a condition — it indicates a tendency.
          Always discuss genetic results with your healthcare provider before making changes.
        </span>
      </div>

      {/* Category groups */}
      {Object.entries(GENE_CATEGORIES).map(([catKey, catInfo]) => {
        const items = grouped[catKey];
        if (!items || items.length === 0) return null;
        const isExpanded = expandedCats.has(catKey);
        const flagged = items.filter(i => i.impact === 'high' || i.impact === 'critical').length;

        return (
          <div key={catKey} style={{ marginBottom: '1rem' }}>
            <button
              onClick={() => toggleCat(catKey)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.75rem 1rem',
                background: 'var(--color-surface-offset)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                color: 'var(--color-tx)',
                textAlign: 'left',
              }}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>{catInfo.icon}</span>
              <div style={{ flex: 1 }}>
                <div>{catInfo.label}</div>
                <div style={{ fontWeight: 400, fontSize: 'var(--text-xs)', color: 'var(--color-tx-muted)' }}>{catInfo.description}</div>
              </div>
              <span className="badge badge-muted">{items.length}</span>
              {flagged > 0 && <span className="badge badge-warning">{flagged} notable</span>}
            </button>
            {isExpanded && (
              <div style={{ padding: '0.75rem 0.5rem' }}>
                {items.map(g => (
                  <div
                    key={g.gene + g.date}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.6rem 0.75rem',
                      borderBottom: '1px solid var(--color-divider)',
                      fontSize: 'var(--text-sm)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {g.impact === 'critical' ? (
                        <AlertTriangle size={14} style={{ color: 'var(--color-error)' }} />
                      ) : g.impact === 'high' ? (
                        <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
                      ) : (
                        <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
                      )}
                      <span style={{ fontWeight: 600 }}>{g.gene}</span>
                      {g.variant && <span style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-xs)' }}>({g.variant})</span>}
                    </div>
                    <span className={`badge badge-${g.impact === 'normal' ? 'success' : g.impact === 'critical' ? 'error' : 'warning'}`}>
                      {g.impact}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Manual Restrictions Tab (original content) ── */
function ManualRestrictionsTab({
  restrictions,
  activeMemberId,
  onAdd,
  onEdit,
  onDelete,
}: {
  restrictions: Restriction[];
  activeMemberId: string | null;
  onAdd: (item: string) => void;
  onEdit: (r: Restriction) => void;
  onDelete: (id: string) => void;
}) {
  const confirmed = restrictions.filter(r => r.confirmed);
  const suggested = restrictions.filter(r => !r.confirmed);

  return (
    <div>
      {activeMemberId && (
        <div className="section">
          <h3 className="section-title">Quick Add Common Allergens</h3>
          <div className="restriction-chips">
            {QUICK_ADD_PRESETS.map(item => (
              <button
                key={item}
                className="badge badge-muted"
                style={{ cursor: 'pointer' }}
                onClick={() => onAdd(item)}
                disabled={restrictions.some(r => r.item_name === item)}
              >
                + {item}
              </button>
            ))}
          </div>
        </div>
      )}

      {suggested.length > 0 && (
        <div className="section">
          <h3 className="section-title" style={{ color: 'var(--color-warning)' }}>
            AI-Suggested Restrictions ({suggested.length})
          </h3>
          <div className="restriction-list">
            {suggested.map(r => (
              <div key={r.id} className="restriction-item suggested">
                <div className="restriction-info">
                  <span className={`badge badge-${r.severity === 'critical' ? 'error' : 'warning'}`}>{r.restriction_type.replace(/_/g, ' ')}</span>
                  <strong>{r.item_name}</strong>
                  {r.reaction && <span className="restriction-reaction">{r.reaction}</span>}
                </div>
                <div className="restriction-actions">
                  <button className="btn btn-sm btn-primary" onClick={() => {/* confirm */}}>Confirm</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => onDelete(r.id)}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirmed.length === 0 && suggested.length === 0 ? (
        <div className="empty-state">
          <ShieldAlert size={48} />
          <h2>No restrictions</h2>
          <p>Add food allergies, drug interactions, or dietary restrictions for this family member.</p>
        </div>
      ) : (
        <div className="restriction-list">
          {confirmed.map(r => (
            <div key={r.id} className="restriction-item">
              <div className="restriction-info">
                <span className={`severity-dot severity-${r.severity}`} />
                <span className="badge badge-muted">{r.restriction_type.replace(/_/g, ' ')}</span>
                <strong>{r.item_name}</strong>
                {r.reaction && <span className="restriction-reaction">{'\u2014'} {r.reaction}</span>}
              </div>
              <div className="restriction-actions">
                <button className="btn btn-sm btn-ghost" onClick={() => onEdit(r)}>
                  <Edit2 size={14} />
                </button>
                <button className="btn btn-sm btn-ghost" style={{ color: 'var(--color-error)' }} onClick={() => onDelete(r.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ── */
export default function RestrictionsPage() {
  const { restrictions, activeMemberId, familyMembers, addRestriction, deleteRestriction } = useHealthStore();
  const member = familyMembers.find(m => m.id === activeMemberId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Restriction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RestrictionsTab>('manual');

  const handleQuickAdd = (item: string) => {
    if (!activeMemberId) return;
    addRestriction({
      member_id: activeMemberId,
      restriction_type: 'food_allergy',
      item_name: item,
      severity: 'warning',
      source: 'manual',
      confirmed: true,
    });
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Restrictions</h1>
          <p className="view-subtitle">
            {member ? `${member.first_name}'s food & medicine restrictions` : 'Select a family member'}
          </p>
        </div>
        {activeTab === 'manual' && (
          <button className="btn btn-primary" onClick={() => { setEditItem(null); setModalOpen(true); }} disabled={!activeMemberId}>
            <Plus size={14} /> Add Restriction
          </button>
        )}
      </div>

      {/* Tab Bar */}
      <div className="reports-tab-bar">
        <button
          className={`reports-tab${activeTab === 'manual' ? ' active' : ''}`}
          onClick={() => setActiveTab('manual')}
        >
          <ShieldAlert size={15} />
          <span>Manual</span>
          <span className="reports-tab-count">{restrictions.length}</span>
        </button>
        <button
          className={`reports-tab${activeTab === 'food' ? ' active' : ''}`}
          onClick={() => setActiveTab('food')}
        >
          <Utensils size={15} />
          <span>Food Sensitivities</span>
        </button>
        <button
          className={`reports-tab${activeTab === 'genetics' ? ' active' : ''}`}
          onClick={() => setActiveTab('genetics')}
        >
          <Dna size={15} />
          <span>Genetics</span>
        </button>
      </div>

      {activeTab === 'manual' && (
        <ManualRestrictionsTab
          restrictions={restrictions}
          activeMemberId={activeMemberId}
          onAdd={handleQuickAdd}
          onEdit={(r) => { setEditItem(r); setModalOpen(true); }}
          onDelete={(id) => setDeleteId(id)}
        />
      )}

      {activeTab === 'food' && (
        <FoodSensitivityTab memberId={activeMemberId} />
      )}

      {activeTab === 'genetics' && (
        <GeneticsTab memberId={activeMemberId} />
      )}

      <RestrictionModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null); }}
        restriction={editItem}
        memberId={activeMemberId}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteRestriction(deleteId); }}
        title="Delete Restriction"
        message="Are you sure you want to remove this restriction?"
      />
    </div>
  );
}
